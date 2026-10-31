-- 0007_per_passenger_fare_and_rider_seats.sql
-- Forward-only, idempotent, non-destructive. Prerequisites: 0001 to 0006. Safe to run more than once.
-- Apply:  supabase db push      (or paste into the Supabase SQL editor as the project owner)

-- A) The fare is now PER PASSENGER: total = 20000 kobo x passengers. The old rule (fare must equal 20000) is replaced by
--    "fare must equal 20000 x passenger_count". Every existing ride has passenger_count = 1 and a 20000 fare, so none breaks.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.rides'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%fare_amount_kobo = 20000%'
  loop execute format('alter table public.rides drop constraint %I', c.conname); end loop;
end $$;
alter table public.rides drop constraint if exists rides_fare_matches_passengers;
alter table public.rides add constraint rides_fare_matches_passengers check (fare_amount_kobo = 20000 * passenger_count);

-- B) Seats a rider declares at registration (passengers only; the driver is not counted). Declared is not the same as
--    confirmed: capacity_verified becomes true when an administrator approves the application (or confirms the seats).
alter table public.vehicles add column if not exists capacity_declared boolean not null default false;

-- C) Heartbeat lookups (riders count as online only while last_seen_at is recent).
create index if not exists rider_profiles_online_seen_idx on public.rider_profiles (is_online, last_seen_at);
