-- 0005_landmark_location_metadata_and_optional_registration.sql
-- Forward-only, idempotent, non-destructive. Prerequisites: 0001, 0002.

-- A) Tricycle registration ("keke number") is no longer required. The vehicle ROW stays (accept_ride needs an approved
--    vehicle and holds capacity); only the number becomes optional. Existing numbers and the unique rule are untouched
--    (Postgres treats NULLs as distinct, so many vehicles may have no number).
alter table public.vehicles alter column registration_number drop not null;
alter table public.vehicles drop constraint if exists vehicles_registration_number_len;
alter table public.vehicles add constraint vehicles_registration_number_len
  check (registration_number is null or length(btrim(registration_number)) between 3 and 20) not valid;  -- applies to new/changed rows only

-- B) Landmark location metadata. is_verified (existing) remains the ONLY "ground verified" flag.
alter table public.campus_locations
  add column if not exists location_source text check (location_source in ('search', 'gps', 'map', 'legacy')),
  add column if not exists located_at timestamptz,
  add column if not exists located_by uuid references public.profiles(id),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id);

-- Backfill without touching coordinates or the verified flag. Rows still at the (0,0) placeholder stay NULL = "not located".
update public.campus_locations set location_source = 'legacy'
where location_source is null and not (abs(latitude) < 0.01 and abs(longitude) < 0.01);

-- C) Database-level guard: coordinates of a ground-verified landmark cannot change unless verification is cleared
--    in the same statement (the app does that only after an explicit admin confirmation).
create or replace function public.guard_verified_location() returns trigger language plpgsql as $$
begin
  if old.is_verified and new.is_verified
     and (new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude) then
    raise exception 'verified coordinates cannot be changed without clearing verification' using errcode = '42501';
  end if;
  if new.is_verified and not old.is_verified and new.location_source is null then
    raise exception 'a location cannot be verified before it has been located' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists campus_locations_guard_verified on public.campus_locations;
create trigger campus_locations_guard_verified before update on public.campus_locations
  for each row execute function public.guard_verified_location();
