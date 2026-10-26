-- Read-only checks after migration 0007.
SELECT
  'fare constraint exists' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.rides'::regclass
      AND conname = 'rides_fare_matches_passengers'
  ) AS ok

UNION ALL

SELECT
  'vehicles.capacity_declared exists',
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'capacity_declared'
  )

UNION ALL

SELECT
  'rider_profiles.last_seen_at exists',
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rider_profiles'
      AND column_name = 'last_seen_at'
  )

UNION ALL

SELECT
  'all ride fares match passenger counts',
  NOT EXISTS (
    SELECT 1
    FROM public.rides
    WHERE fare_amount_kobo IS DISTINCT FROM 20000 * passenger_count
  );