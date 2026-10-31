-- 0007_per_passenger_fare_presence_capacity.sql
-- Forward-only, idempotent, NON-destructive. Prerequisites: 0001 to 0006. Safe to run more than once.
-- Apply:  supabase db push      (or paste into the Supabase SQL editor as the project owner)
-- Nothing here deletes or rewrites existing users, rides, wallets, payments or rider profiles.

-- A) PER-PASSENGER FARE (₦200 x passengers).
--    rides.fare_amount_kobo is now the TOTAL. The old check "fare_amount_kobo = 20000" (one fixed fare per ride) must go.
--    Rides made before this migration keep their old per-ride total: they have fare_per_passenger_kobo NULL and stay valid under rule 1.
alter table public.rides add column if not exists fare_per_passenger_kobo integer;
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.rides'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%fare_amount_kobo%20000%' and conname <> 'rides_fare_matches_passengers'
  loop execute format('alter table public.rides drop constraint %I', c.conname); end loop;
end $$;
alter table public.rides drop constraint if exists rides_fare_matches_passengers;
alter table public.rides add constraint rides_fare_matches_passengers check (
  (fare_per_passenger_kobo is null and fare_amount_kobo = 20000)                                              -- legacy: one fixed fare per ride
  or (fare_per_passenger_kobo is not null and fare_per_passenger_kobo = 20000                                  -- new: ₦200 x passengers
      and fare_amount_kobo = fare_per_passenger_kobo * passenger_count)                                        -- (is not null: a NULL here would make the CHECK pass)
);
comment on column public.institutions.default_fare_kobo is 'Fare PER PASSENGER in kobo (20000 = ₦200).';

-- The immutability trigger from 0001 compares fare_amount_kobo; also freeze the per-passenger fare and passenger count once booked.
create or replace function public.guard_ride_fare_fields() returns trigger language plpgsql as $$
begin
  if new.passenger_count is distinct from old.passenger_count
     or new.fare_per_passenger_kobo is distinct from old.fare_per_passenger_kobo then
    raise exception 'passenger count and fare cannot be changed after booking' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists rides_guard_fare_fields on public.rides;
create trigger rides_guard_fare_fields before update on public.rides for each row execute function public.guard_ride_fare_fields();

-- B) SEAT CAPACITY comes from the rider at registration. vehicles.capacity (1..8) already exists, so no new column.
--    vehicles.capacity_verified now means "capacity was explicitly declared by the rider or set by an administrator".
--    Existing rows keep their value (false for pre-0007 vehicles, whose capacity is only the old default of 3): they can still take
--    single passengers, and an administrator can set their real capacity from Admin -> Riders.
comment on column public.vehicles.capacity is 'Passenger seats, driver NOT counted.';
comment on column public.vehicles.capacity_verified is 'true = capacity declared by the rider at registration or set by an administrator.';

-- C) PRESENCE. A rider only counts as online while is_online AND they were seen recently (heartbeat from the rider page).
--    This takes riders offline safely on closed tabs, dead phones and expired sessions without a background job.
--    The app uses BABRIDE_PRESENCE_TTL_SEC (default 120 s); the database keeps a looser 300 s safety net.
create or replace function public.accept_ride_for(p_ride uuid, p_rider uuid) returns public.rides
language plpgsql security definer set search_path = public as $$
declare r public.rides; v_cap smallint; v_cap_ok boolean;
begin
  if not exists (
    select 1 from public.rider_profiles rp join public.profiles p on p.id = rp.user_id
    where rp.user_id = p_rider and rp.approval_status = 'approved' and rp.is_online
      and rp.last_seen_at is not null and rp.last_seen_at > now() - interval '300 seconds'
      and p.account_status = 'active' and p.role = 'rider'
      and exists (select 1 from public.vehicles v where v.rider_id = p_rider and v.approval_status = 'approved')
  ) then raise exception 'rider_not_eligible'; end if;

  perform pg_advisory_xact_lock(hashtext(p_rider::text));
  if exists (select 1 from public.rides where assigned_rider_id = p_rider
             and status in ('assigned','rider_arriving','rider_arrived','in_progress'))
  then raise exception 'rider_busy'; end if;

  select * into r from public.rides where id = p_ride for update;
  if not found or r.status <> 'searching' then raise exception 'ride_unavailable'; end if;

  if r.passenger_count > 1 then
    select v.capacity, v.capacity_verified into v_cap, v_cap_ok
      from public.vehicles v where v.rider_id = p_rider and v.approval_status = 'approved'
      order by v.capacity_verified desc, v.capacity desc limit 1;
    if not coalesce(v_cap_ok, false) then raise exception 'capacity_unverified'; end if;
    if v_cap < r.passenger_count then raise exception 'over_capacity'; end if;
  end if;

  update public.rides set status = 'assigned', assigned_rider_id = p_rider, assigned_at = now()
    where id = p_ride returning * into r;
  insert into public.ride_status_events (ride_id, actor_id, previous_status, new_status, reason)
    values (p_ride, p_rider, 'searching', 'assigned', 'accepted by rider');
  return r;
end $$;
revoke all on function public.accept_ride_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_ride_for(uuid, uuid) to service_role;

-- D) LANDMARKS. Nothing to migrate: "located" is now decided by the coordinates themselves in the app.
--    Rows still at the (0,0) / (0, 0.000x) seed placeholders correctly stay "Needs location" until an administrator sets them.
