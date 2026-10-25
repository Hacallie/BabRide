-- 0006_passengers_capacity_and_unlocated_pickups.sql
-- Forward-only, idempotent, non-destructive. Prerequisites: 0001 to 0005. Safe to run more than once.
-- Apply:  supabase db push      (or paste into the Supabase SQL editor as the project owner)

-- A) Group bookings. The fare stays 20000 kobo PER RIDE: there is no per-seat charge.
alter table public.rides add column if not exists passenger_count smallint not null default 1;
alter table public.rides drop constraint if exists rides_passenger_count_range;
alter table public.rides add constraint rides_passenger_count_range check (passenger_count between 1 and 8);

-- B) Vehicle capacity. vehicles.capacity already exists (default 3). It only counts for a GROUP once an
--    administrator has confirmed it; until then a vehicle is treated as having "no verified capacity".
alter table public.vehicles add column if not exists capacity_verified boolean not null default false;

-- C) A ride picked up at a landmark that has no map position yet has no coordinates. Never store 0,0 as a position.
alter table public.rides alter column pickup_latitude drop not null;
alter table public.rides alter column pickup_longitude drop not null;
alter table public.rides drop constraint if exists rides_pickup_present;
alter table public.rides add constraint rides_pickup_present
  check (pickup_location_id is not null or (pickup_latitude is not null and pickup_longitude is not null)) not valid; -- new rows only
update public.rides r set pickup_latitude = null, pickup_longitude = null
  from public.campus_locations c
 where r.pickup_location_id = c.id and c.location_source is null and r.pickup_latitude = 0 and r.pickup_longitude = 0;

-- D) Atomic acceptance now also enforces capacity. A single passenger fits any approved vehicle; a group needs a
--    capacity an administrator confirmed, and it must be large enough. Same locking as before (only one rider wins).
create or replace function public.accept_ride_for(p_ride uuid, p_rider uuid) returns public.rides
language plpgsql security definer set search_path = public as $$
declare r public.rides; v_cap smallint; v_cap_ok boolean;
begin
  if not exists (
    select 1 from public.rider_profiles rp join public.profiles p on p.id = rp.user_id
    where rp.user_id = p_rider and rp.approval_status = 'approved' and rp.is_online
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
