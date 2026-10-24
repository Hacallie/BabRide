-- OWNER-RUN ONLY. Not a migration. Do not commit a real address.
-- Run in Supabase Dashboard -> SQL Editor (runs as "postgres"). Prerequisites: migration 0004 applied;
-- the person has signed up (email confirmed) and signed in once so a student profile exists.
-- It promotes ONE existing student account, writes an audit row, and never changes an existing admin.

select public.owner_promote_to_admin('REPLACE-WITH-OWNER-EMAIL@example.com');

-- Verify:
select p.id, p.email, p.role, p.account_status from public.profiles p where p.role = 'admin';
select at, action, target_email from public.admin_audit order by at desc limit 5;

-- To remove an admin (refuses to remove the last one):
-- select public.owner_revoke_admin('someone@example.com');
