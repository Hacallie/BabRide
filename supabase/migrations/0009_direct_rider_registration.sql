-- Rider registration is self-service: new and pending rider records are immediately eligible.
update public.rider_profiles
set approval_status = 'approved', approved_at = coalesce(approved_at, now())
where approval_status = 'pending';

update public.vehicles
set approval_status = 'approved'
where approval_status = 'pending';

update public.campus_locations
set is_active = false
where name = 'Winslow Hall';

alter table public.rider_profiles alter column approval_status set default 'approved';
