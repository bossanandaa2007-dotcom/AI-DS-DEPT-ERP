create or replace function public.is_valid_complaint_assignee(p_assigned_to uuid, p_department_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select p_assigned_to is null
    or exists (
      select 1
      from public.profiles p
      where p.id = p_assigned_to
        and p.status = 'active'
        and p.role in ('super_admin', 'hod', 'faculty', 'lab_assistant')
        and (p.role = 'super_admin' or p.department_id = p_department_id)
    )
$$;

drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints
for update to authenticated
using (assigned_to = auth.uid() or public.can_manage_department(department_id))
with check (
  (assigned_to = auth.uid() or public.can_manage_department(department_id))
  and public.is_valid_complaint_assignee(assigned_to, department_id)
);
