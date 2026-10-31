-- Read-only checks after applying 0007. Every query should return the shown expectation.
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.rides'::regclass and contype = 'c' and conname like '%fare%';  -- expect rides_fare_matches_passengers only
select column_name from information_schema.columns where table_name = 'rides' and column_name = 'fare_per_passenger_kobo';                          -- expect 1 row
select count(*) as legacy_rides_kept from public.rides where fare_per_passenger_kobo is null;                                                      -- any number: preserved, not rewritten
select name, latitude, longitude from public.campus_locations where abs(latitude) < 0.001 and abs(longitude) < 0.001 order by name;                -- landmarks still needing a real position
