# Bab Ride

Campus-only tricycle booking for Babcock University, Nigeria. Fare ₦200 per passenger (20000 kobo each; total = ₦200 × passengers), computed and enforced on the server.
Not affiliated with or endorsed by the university unless that authorization is obtained.

## Status after Phase 4, Step 1

Step 1 removed demo mode and added environment validation. **Nothing in this step has been built or run end to end:**
the sandbox it was written in could not run `npm install`, `npm test`, `npm run typecheck`, or `npm run build`.
Run them yourself (below) before relying on it.

| Area | Status |
|---|---|
| Demo mode, demo cookie, demo sign-in route, demo labels | **Removed.** The app has no simulated users, rides or data |
| Environment validation (`src/lib/env.ts`) | Written. Reports variable names only, never values |
| Startup check (`instrumentation.ts`) | Written. Logs config problems at server start |
| Missing/invalid config | Data APIs return HTTP 503; a red banner appears; sign-in is unavailable |
| Fare engine | The "boundary unset" bypass is **gone**. No fare is quoted until a real service boundary is configured |
| Tests | Rewritten to use a test-only in-memory repo under `tests/helpers/`. Added env and no-demo tests |
| Wallets, Paystack, payouts, maps, realtime, photos, reviews, Google/Apple sign-in | **Not built yet** (later steps) |

**Consequence to know about:** with a real Supabase project, bookings are refused with `BOUNDARY_NOT_CONFIGURED` until
`institutions.campus_boundary` is set to a real, approved campus polygon. Landmark coordinates are still `0,0` placeholders
(flagged unverified). Surveyed coordinates are needed before the booking flow can work for real users.

## 1. Local development (Windows PowerShell)

You need your own **development** Supabase project. Do not point local development at your production project.

```powershell
cd C:\Users\abdul\Desktop\bab-ride
npm install
Copy-Item .env.example .env.local
notepad .env.local      # fill in the three required Supabase values
```

In the Supabase SQL editor, run in order: every file in `supabase/migrations/` (`0001` to `0007`), then `supabase/seed.sql`. Existing projects only need the files they have not yet applied (for this update: `0007_per_passenger_fare_presence_capacity.sql`, then check with `supabase/diagnostics/0007_verify.sql`).
Then:

```powershell
npm run dev
```

Open http://localhost:3000. If a required variable is missing or still a placeholder, the server log and a red banner list the
variable **names** (not values). The first run needs internet access to download the Inter font.

Make yourself an admin (this is deliberately a manual database step, never an app feature):

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

Riders sign up as students, apply on the Rider page, and an admin approves them.

To exercise bookings in a **development** database before real coordinates exist, you may set your own throw-away polygon
(format `[[longitude, latitude], ...]`, at least 3 points). Never copy a made-up polygon into production:

```sql
update institutions set campus_boundary = '[[LNG1,LAT1],[LNG2,LAT2],[LNG3,LAT3],[LNG1,LAT1]]'::jsonb where slug = 'babcock';
```

## 2. Automated tests

```powershell
npm run test        # unit and service tests, no network, no database, no credentials
npm run typecheck
npm run build
```

Tests use `tests/helpers/memory-repo.ts`, a clearly labelled in-memory test double with fixture names such as "Test Student"
and a test-only square boundary around (0,0). It is never imported by application code, and `tests/no-demo.test.ts` fails if
demo code or that helper leaks into `src/`. Tests never touch real accounts or money.

## 3. Sandbox testing (applies from the payments step onward)

Create a **separate** Supabase project and a **separate** `.env.local` (or host environment) for sandbox, with provider
*test* credentials only. Nothing in this step uses a payment provider yet.

## 4. Production deployment

1. A dedicated Supabase project; run the migrations in order; set a real, approved `campus_boundary`; replace placeholder landmarks with surveyed, verified ones.
2. Set the host's environment variables (see `.env.example`). `NEXT_PUBLIC_APP_URL` is required in production and must be `https://`. Never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable; validation flags that.
3. `npm run build` then `npm run start`, or deploy to your host.
4. Check the server log at startup: it must say nothing about missing or invalid variables.
5. Promote the first admin with the SQL above.

## Campus data

Landmarks (CAF, BUSA, Big Meal, Guest House, Amphitheatre, Emerald Hall, Winslow Hall) are names supplied by the project owner.
Their coordinates are **placeholders** and shown as "unverified". The campus boundary is unset until supplied.

## Sign-in, rider onboarding and troubleshooting

- `/login` (students and everyone), `/rider/join` (rider onboarding: account, then tricycle registration, then a **pending** application an administrator must approve). Both share the dark glass look of the homepage.
- Email code, email link, password, and (optional) Google/Apple. See `supabase/templates/auth-email.html` and `.env.example`.
- **Google/Apple buttons are hidden unless `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` / `NEXT_PUBLIC_AUTH_APPLE_ENABLED` is `true`.** These values are read when the dev server starts: after editing `.env.local`, stop and rerun `npm run dev`. In development, a dashed note on the login page says when a button is hidden. Showing the button does not mean Google works: the provider must be enabled in Supabase with a Google client ID and secret (Google Cloud Console), and `https://<project-ref>.supabase.co/auth/v1/callback` must be an authorized redirect URI.
- `GET /api/v1/me 401` is normal for visitors who are not signed in. If it happens **right after** a successful sign-in, check (names only): `SUPABASE_SERVICE_ROLE_KEY` must belong to the same project as `NEXT_PUBLIC_SUPABASE_URL`. A signed-in user whose profile row is missing now gets `403 PROFILE_MISSING` and a server log line; fix by applying `supabase/migrations/0002_app.sql` (the `handle_new_user` trigger).
- `otp_expired` on the callback means the link was already used, expired, or pre-opened by an email scanner. A link and a code in the same email are one token: using one cancels the other. Request a new email.

## Booking, maps, availability and fares (latest update)

- **Fare:** ₦200 × passengers (1 = ₦200 … 4 = ₦800). Computed on the server from the passenger count; the client's fare is ignored. Stored on the ride as `fare_per_passenger_kobo` and `fare_amount_kobo` (total). Rides created before this update keep their old per-ride total.
- **Seat capacity:** riders enter *Passenger seat capacity* (driver not counted) when applying. Bookings are refused up front if no approved keke seats the group, and a rider can only accept a group their capacity covers. Approval workflow is unchanged.
- **Auto-online:** after a rider signs in, the app calls `POST /api/v1/rider/session/start`, which sets them Online (if approved, not suspended, vehicle approved). Sign-out calls `/rider/session/end`. Presence also expires on its own if the rider page stops sending heartbeats (`BABRIDE_PRESENCE_TTL_SEC`).
- **Landmarks:** "has a map position" is decided only by real coordinates. Administrators save positions in Admin → Landmarks; the Overview tab lists landmarks that still need one.
- **Search / Use my location:** the campus search matches landmark names; admin place search uses the configured geocoder and is limited to the campus (saved `campus_boundary`, else `GEOCODER_VIEWBOX`). "Use my location" asks the server for the nearest landmark within `BABRIDE_NEAREST_MAX_METERS`.
