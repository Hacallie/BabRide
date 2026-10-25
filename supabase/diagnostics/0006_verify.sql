-- Read-only. Run in the Supabase SQL editor after applying migrations 0005 and 0006. Every row should say ok = true.
select 'rides.passenger_count exists' as check, exists (select 1 from information_schema.columns where table_schema='public' and table_name='rides' and column_name='passenger_count') as ok
union all select 'vehicles.capacity_verified exists', exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='capacity_verified')
union all select 'vehicles.registration_number is nullable (0005: riders can apply without a number)', exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='registration_number' and is_nullable='YES')
union all select 'rides.pickup_latitude is nullable (landmark pickups carry no fake 0,0)', exists (select 1 from information_schema.columns where table_schema='public' and table_name='rides' and column_name='pickup_latitude' and is_nullable='YES')
union all select 'accept_ride_for enforces capacity', (select position('over_capacity' in pg_get_functiondef(p.oid)) > 0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_ride_for' limit 1)
union all select 'accept_ride_for is NOT callable by signed-in users', not has_function_privilege('authenticated', 'public.accept_ride_for(uuid,uuid)', 'execute')
union all select 'no ride has a 0,0 pickup', not exists (select 1 from public.rides where pickup_latitude = 0 and pickup_longitude = 0);
