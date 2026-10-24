-- Bab Ride core schema. Seed/landmark data is PLACEHOLDER until verified.
create extension if not exists pgcrypto;

create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique,
  currency text not null default 'NGN',
  default_fare_kobo integer not null default 20000 check (default_fare_kobo > 0),
  campus_boundary jsonb,            -- GeoJSON ring; NULL until verified
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid not null references institutions(id),
  full_name text not null, email text,
  role text not null default 'student' check (role in ('student','rider','admin')),
  account_status text not null default 'active' check (account_status in ('active','suspended')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table rider_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','suspended')),
  is_online boolean not null default false,
  last_seen_at timestamptz, last_latitude double precision, last_longitude double precision,
  approved_at timestamptz, approved_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references rider_profiles(user_id) on delete cascade,
  institution_id uuid not null references institutions(id),
  registration_number text not null,
  capacity smallint not null default 3 check (capacity between 1 and 8),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (institution_id, registration_number)
);

create table campus_zones (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  name text not null, boundary jsonb, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table campus_locations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  zone_id uuid references campus_zones(id),
  name text not null, description text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  is_verified boolean not null default false,   -- placeholders stay false
  is_pickup_allowed boolean not null default true,
  is_destination_allowed boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table rides (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  student_id uuid not null references profiles(id),
  assigned_rider_id uuid references profiles(id),
  pickup_latitude double precision not null, pickup_longitude double precision not null,
  pickup_location_id uuid references campus_locations(id),
  pickup_zone_id uuid references campus_zones(id),
  destination_location_id uuid not null references campus_locations(id),
  destination_zone_id uuid references campus_zones(id),
  fare_amount_kobo integer not null check (fare_amount_kobo = 20000),  -- v1 fixed fare
  currency text not null default 'NGN',
  payment_method text not null check (payment_method in ('cash','electronic')),
  status text not null default 'searching' check (status in
    ('searching','assigned','rider_arriving','rider_arrived','in_progress','completed','cancelled','expired')),
  idempotency_key text not null,
  requested_at timestamptz not null default now(),
  assigned_at timestamptz, rider_arrived_at timestamptz, started_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, cancellation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (student_id, idempotency_key)               -- double-tap safe
);
create index rides_student_idx on rides (student_id, created_at desc);
create index rides_rider_idx on rides (assigned_rider_id) where assigned_rider_id is not null;
create index rides_searching_idx on rides (institution_id, requested_at) where status = 'searching';
-- A student may have only one active ride; a rider only one active assignment.
create unique index one_active_ride_per_student on rides (student_id)
  where status in ('searching','assigned','rider_arriving','rider_arrived','in_progress');
create unique index one_active_ride_per_rider on rides (assigned_rider_id)
  where assigned_rider_id is not null and status in ('assigned','rider_arriving','rider_arrived','in_progress');

create table ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id) on delete cascade,
  rider_id uuid not null references rider_profiles(user_id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','withdrawn')),
  offered_at timestamptz not null default now(), expires_at timestamptz not null, responded_at timestamptz,
  unique (ride_id, rider_id)
);
create index ride_offers_rider_idx on ride_offers (rider_id, status, expires_at);

create table ride_status_events (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id) on delete cascade,
  actor_id uuid references profiles(id),
  previous_status text, new_status text not null, reason text,
  created_at timestamptz not null default now()
);

-- Enforce fare immutability and the state machine at the database level.
create or replace function guard_ride_update() returns trigger language plpgsql as $$
begin
  if new.fare_amount_kobo <> old.fare_amount_kobo or new.student_id <> old.student_id
     or new.institution_id <> old.institution_id then
    raise exception 'immutable ride field';
  end if;
  if new.status <> old.status and not (
    (old.status='searching' and new.status in ('assigned','cancelled','expired')) or
    (old.status='assigned' and new.status in ('rider_arriving','cancelled','searching')) or
    (old.status='rider_arriving' and new.status in ('rider_arrived','cancelled','searching')) or
    (old.status='rider_arrived' and new.status in ('in_progress','cancelled')) or
    (old.status='in_progress' and new.status='completed')
  ) then raise exception 'invalid ride transition % -> %', old.status, new.status; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger rides_guard before update on rides for each row execute function guard_ride_update();

-- Atomic, race-safe acceptance. Only one rider can win.
create or replace function accept_ride(p_ride uuid) returns rides
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rides;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from rider_profiles rp
    join profiles p on p.id = rp.user_id
    where rp.user_id = uid and rp.approval_status='approved' and rp.is_online
      and p.account_status='active' and p.role='rider'
      and exists (select 1 from vehicles v where v.rider_id=uid and v.approval_status='approved')
  ) then raise exception 'rider_not_eligible'; end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));
  if exists (select 1 from rides where assigned_rider_id=uid
             and status in ('assigned','rider_arriving','rider_arrived','in_progress'))
  then raise exception 'rider_busy'; end if;

  select * into r from rides where id=p_ride for update;
  if not found or r.status <> 'searching' then raise exception 'ride_unavailable'; end if;
  if not exists (select 1 from ride_offers where ride_id=p_ride and rider_id=uid
                 and status='pending' and expires_at > now())
  then raise exception 'no_valid_offer'; end if;

  update rides set status='assigned', assigned_rider_id=uid, assigned_at=now()
    where id=p_ride returning * into r;
  update ride_offers set status='accepted', responded_at=now() where ride_id=p_ride and rider_id=uid;
  update ride_offers set status='withdrawn', responded_at=now()
    where ride_id=p_ride and rider_id<>uid and status='pending';
  insert into ride_status_events(ride_id, actor_id, previous_status, new_status, reason)
    values (p_ride, uid, 'searching', 'assigned', 'accepted by rider');
  return r;
end $$;
revoke all on function accept_ride(uuid) from public;
grant execute on function accept_ride(uuid) to authenticated;

-- Row Level Security. Writes to rides/offers/events go through server code or security-definer functions.
alter table institutions enable row level security;
alter table profiles enable row level security;
alter table rider_profiles enable row level security;
alter table vehicles enable row level security;
alter table campus_zones enable row level security;
alter table campus_locations enable row level security;
alter table rides enable row level security;
alter table ride_offers enable row level security;
alter table ride_status_events enable row level security;

create or replace function my_role() returns text language sql stable security definer set search_path=public
  as $$ select role from profiles where id = auth.uid() $$;
create or replace function my_institution() returns uuid language sql stable security definer set search_path=public
  as $$ select institution_id from profiles where id = auth.uid() $$;

create policy institutions_read on institutions for select to authenticated using (id = my_institution());
create policy profiles_self_read on profiles for select to authenticated using (id = auth.uid());
-- No profile UPDATE policy: role/status can only change via trusted server code.
create policy rider_self_read on rider_profiles for select to authenticated using (user_id = auth.uid());
create policy vehicles_owner_read on vehicles for select to authenticated using (rider_id = auth.uid());
create policy zones_read on campus_zones for select to authenticated using (institution_id = my_institution() and is_active);
create policy locations_read on campus_locations for select to authenticated using (institution_id = my_institution() and is_active);
create policy rides_student_read on rides for select to authenticated using (student_id = auth.uid());
create policy rides_rider_read on rides for select to authenticated using (assigned_rider_id = auth.uid());
create policy offers_rider_read on ride_offers for select to authenticated using (rider_id = auth.uid());
create policy events_participant_read on ride_status_events for select to authenticated
  using (exists (select 1 from rides r where r.id = ride_id and (r.student_id = auth.uid() or r.assigned_rider_id = auth.uid())));

-- Admin policies come with the admin stage (institution-scoped, audited).
