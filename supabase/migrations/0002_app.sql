-- Stage 2: payment_status, auto profile creation, service-role accept function.
alter table rides add column if not exists payment_status text not null default 'outstanding'
  check (payment_status in ('outstanding','collected'));

-- New auth users always become STUDENTS. Riders/admins are promoted only by trusted server code or SQL.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, institution_id, full_name, email, role)
  select new.id, i.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email, 'student'
  from institutions i where i.slug = 'babcock' limit 1;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- MVP "broadcast" acceptance used by the Next.js server (service role). Same locking guarantees
-- as accept_ride, but without per-rider offers (proximity offers arrive in the dispatch stage).
create or replace function accept_ride_for(p_ride uuid, p_rider uuid) returns rides
language plpgsql security definer set search_path = public as $$
declare r rides;
begin
  if not exists (
    select 1 from rider_profiles rp join profiles p on p.id = rp.user_id
    where rp.user_id = p_rider and rp.approval_status = 'approved' and rp.is_online
      and p.account_status = 'active' and p.role = 'rider'
      and exists (select 1 from vehicles v where v.rider_id = p_rider and v.approval_status = 'approved')
  ) then raise exception 'rider_not_eligible'; end if;

  perform pg_advisory_xact_lock(hashtext(p_rider::text));
  if exists (select 1 from rides where assigned_rider_id = p_rider
             and status in ('assigned','rider_arriving','rider_arrived','in_progress'))
  then raise exception 'rider_busy'; end if;

  select * into r from rides where id = p_ride for update;
  if not found or r.status <> 'searching' then raise exception 'ride_unavailable'; end if;

  update rides set status = 'assigned', assigned_rider_id = p_rider, assigned_at = now()
    where id = p_ride returning * into r;
  insert into ride_status_events (ride_id, actor_id, previous_status, new_status, reason)
    values (p_ride, p_rider, 'searching', 'assigned', 'accepted by rider');
  return r;
end $$;
revoke all on function accept_ride_for(uuid, uuid) from public, anon, authenticated;
grant execute on function accept_ride_for(uuid, uuid) to service_role;
