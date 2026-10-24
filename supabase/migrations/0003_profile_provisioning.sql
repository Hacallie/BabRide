-- 0003_profile_provisioning.sql
-- Fixes "valid Supabase session but no profiles row" (GET /api/v1/me -> 403 PROFILE_MISSING).
-- Forward-only and idempotent: safe to run more than once. Never deletes or overwrites existing rows.
--
-- Root causes addressed
--  1. on_auth_user_created is an AFTER INSERT trigger, so it never ran for Auth users created before
--     0002 was applied. Re-running 0002 cannot fix those users.
--  2. The old trigger used "INSERT ... SELECT ... FROM institutions WHERE slug='babcock'". If that
--     institution row did not exist at signup time, the SELECT returned zero rows, nothing was inserted
--     and NO error was raised, so signup "worked" with no profile.
--  3. coalesce(full_name, ...) kept an empty-string full_name, and Google's "name" claim was ignored.

-- One shared, idempotent routine used by the trigger, the backfill and the server self-heal.
-- Role is ALWAYS 'student'. Riders/admins are promoted only by trusted server code or SQL.
create or replace function public.provision_profile(p_user uuid)
returns public.profiles
language plpgsql security definer set search_path = public, auth as $$
declare
  v_profile public.profiles;
  v_inst uuid;
begin
  select * into v_profile from public.profiles where id = p_user;
  if found then return v_profile; end if;            -- never touch an existing profile

  select id into v_inst from public.institutions where slug = 'babcock' limit 1;
  if v_inst is null then
    raise warning 'provision_profile: institution slug babcock not found; no profile created for %', p_user;
    return null;
  end if;

  insert into public.profiles (id, institution_id, full_name, email, role)
  select u.id, v_inst,
         coalesce(
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           nullif(btrim(split_part(coalesce(u.email, ''), '@', 1)), ''),
           'Student'),
         u.email, 'student'
  from auth.users u
  where u.id = p_user
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = p_user;
  return v_profile;                                   -- null if the auth user does not exist
end $$;

revoke all on function public.provision_profile(uuid) from public, anon, authenticated;
grant execute on function public.provision_profile(uuid) to service_role;

-- Trigger function: delegates to provision_profile and must never block a signup.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  begin
    perform public.provision_profile(new.id);
  exception when others then
    raise warning 'handle_new_user failed for %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill every existing Auth user that has no profile (includes abdullahillison@gmail.com).
-- Existing profiles are skipped by the NOT EXISTS check and by ON CONFLICT DO NOTHING.
do $$
declare r record; created int := 0;
begin
  for r in select u.id from auth.users u
           where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    if (public.provision_profile(r.id)).id is not null then created := created + 1; end if;
  end loop;
  raise notice 'provision_profile backfill created % profile(s)', created;
end $$;