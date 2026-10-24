-- Read-only. Run in Supabase SQL Editor BEFORE and AFTER applying 0003.

-- A. Does the Babcock institution exist (exactly one row)?
select id, name, slug, is_active from public.institutions where slug = 'babcock';

-- B. Is the trigger attached to auth.users and enabled? (tgenabled = 'O' means enabled)
select tgname, tgenabled from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- C. Auth users WITHOUT a profile (expect 0 rows after 0003).
select u.id, u.email, u.created_at from auth.users u
left join public.profiles p on p.id = u.id where p.id is null;

-- D. When was the account created relative to the institution/profile data?
select u.email, u.created_at as auth_created, i.created_at as institution_created
from auth.users u cross join public.institutions i
where u.email = 'abdullahillison@gmail.com' and i.slug = 'babcock';

-- E. The repaired profile (role must be 'student'; status 'active').
select id, institution_id, full_name, email, role, account_status
from public.profiles where email = 'abdullahillison@gmail.com';

-- F. No duplicates (expect 0 rows) and the function is not callable by browser roles.
select id, count(*) from public.profiles group by id having count(*) > 1;
select has_function_privilege('authenticated', 'public.provision_profile(uuid)', 'execute') as authenticated_can_call,
       has_function_privilege('service_role',  'public.provision_profile(uuid)', 'execute') as service_role_can_call;