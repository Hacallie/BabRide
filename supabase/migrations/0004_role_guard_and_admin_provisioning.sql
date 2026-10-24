-- 0004_role_guard_and_admin_provisioning.sql
-- Purpose: make privilege escalation impossible from the browser, and give the OWNER (not the app) the only way to create an admin.
-- Forward-only. Idempotent. Never deletes or rewrites existing rows. Prerequisites: 0001, 0002 (0003 recommended).
-- Run as the project owner in Supabase SQL Editor (role "postgres"), or with `supabase db push`.

-- 1) Defence in depth: browser roles (anon/authenticated) may READ under RLS but never WRITE these tables directly.
--    All writes already go through the Next.js server (service_role) or SECURITY DEFINER functions owned by postgres.
revoke insert, update, delete on public.profiles, public.rider_profiles, public.vehicles,
  public.campus_locations, public.campus_zones, public.institutions,
  public.rides, public.ride_offers, public.ride_status_events from anon, authenticated;

-- 2) Even if a future policy or grant is added by mistake, client roles cannot change role/status/institution/id,
--    and cannot insert profiles. Server code (service_role) and the owner (SQL editor) are not affected.
create or replace function public.guard_profile_privileged_columns() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  from_client boolean := current_user in ('anon', 'authenticated') or jwt_role in ('anon', 'authenticated');
begin
  if not from_client then return new; end if;
  if tg_op = 'INSERT' then
    raise exception 'profiles cannot be created by client roles' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.role is distinct from old.role
     or new.institution_id is distinct from old.institution_id
     or new.account_status is distinct from old.account_status then
    raise exception 'role, status and institution cannot be changed by client roles' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- 3) Owner-only admin provisioning. Nothing in the app, the browser, signup metadata or a URL can call this.
create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  db_user text not null default current_user,
  action text not null,
  target_user uuid,
  target_email text,
  note text
);
alter table public.admin_audit enable row level security;      -- no policies: invisible to the API
revoke all on public.admin_audit from anon, authenticated;

create or replace function public.owner_promote_to_admin(p_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  u auth.users; p public.profiles;
begin
  if v_email = '' then raise exception 'email is required'; end if;
  select * into u from auth.users where lower(email) = v_email limit 1;
  if not found then raise exception 'No auth user with that email. They must sign up first.'; end if;
  if u.email_confirmed_at is null then
    raise exception 'That email address is not confirmed. Refusing to promote an unverified account.'; end if;
  select * into p from public.profiles where id = u.id for update;
  if not found then
    raise exception 'That user has no profile yet. Apply 0003 and have them sign in once, then retry.'; end if;
  if p.role = 'admin' then return 'already admin: no change'; end if;       -- never silently overwrite
  if p.role <> 'student' then
    raise exception 'Only student accounts can be promoted (found role %). Use a separate account for administration.', p.role; end if;
  if p.account_status <> 'active' then raise exception 'Account is not active.'; end if;
  update public.profiles set role = 'admin' where id = u.id;
  insert into public.admin_audit (action, target_user, target_email, note) values ('promote_admin', u.id, u.email, 'owner SQL');
  return 'promoted to admin';
end $$;

create or replace function public.owner_revoke_admin(p_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); u auth.users; n int;
begin
  select * into u from auth.users where lower(email) = v_email limit 1;
  if not found then raise exception 'No auth user with that email.'; end if;
  select count(*) into n from public.profiles where role = 'admin' and account_status = 'active';
  if n <= 1 then raise exception 'Refusing to remove the last active administrator.'; end if;
  update public.profiles set role = 'student' where id = u.id and role = 'admin';
  if not found then return 'not an admin: no change'; end if;
  insert into public.admin_audit (action, target_user, target_email, note) values ('revoke_admin', u.id, u.email, 'owner SQL');
  return 'admin removed (now student)';
end $$;

revoke all on function public.owner_promote_to_admin(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_revoke_admin(text) from public, anon, authenticated, service_role;
