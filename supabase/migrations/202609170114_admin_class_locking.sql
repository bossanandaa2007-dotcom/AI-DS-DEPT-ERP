-- Admin-exclusive bulk locking of a class's (section's) marks and attendance for its academic
-- year. A section already belongs to exactly one semester/academic year, so locking by section
-- is locking by "class and year" together -- a new section row is created for each new year.
--
-- Also closes an existing gap: attendance_sessions_faculty_update let any HOD bypass status via
-- can_manage_department() with no restriction, so a "locked" session could still be edited
-- directly by table update. HOD is removed from that bypass (Super Admin keeps it), and the
-- bypass itself no longer applies once a session is locked, so a lock is a hard seal: only this
-- migration's lock_attendance_for_section() sets 'locked', and nothing (including Super Admin's
-- own direct table writes) can edit a session after that. assessments_update already excludes
-- HOD (set by 202608080113_super_admin_operational_owner.sql) -- marks needed no RLS change.

drop policy if exists attendance_sessions_faculty_update on public.attendance_sessions;
create policy attendance_sessions_faculty_update on public.attendance_sessions for update to authenticated
using (
  (faculty_id = auth.uid() and status not in ('finalized','locked'))
  or (public.current_role() = 'super_admin' and status <> 'locked')
)
with check (
  (faculty_id = auth.uid() and status not in ('finalized','locked'))
  or (public.current_role() = 'super_admin' and status <> 'locked')
);

create or replace function public.lock_attendance_for_section(p_section_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if public.current_role() <> 'super_admin' then raise exception 'Only the Super Admin can lock a class''s attendance'; end if;
  if not exists (select 1 from public.sections where id = p_section_id) then raise exception 'Section not found'; end if;
  update public.attendance_sessions
  set status = 'locked', finalized_by = coalesce(finalized_by, auth.uid()), finalized_at = coalesce(finalized_at, now())
  where section_id = p_section_id and status <> 'locked';
  get diagnostics v_count = row_count;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), public.current_role(), 'lock', 'attendance', p_section_id::text, jsonb_build_object('sessions_locked', v_count));
  return v_count;
end; $$;
revoke all on function public.lock_attendance_for_section(uuid) from public;
grant execute on function public.lock_attendance_for_section(uuid) to authenticated;

create or replace function public.lock_marks_for_section(p_section_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if public.current_role() <> 'super_admin' then raise exception 'Only the Super Admin can lock a class''s marks'; end if;
  if not exists (select 1 from public.sections where id = p_section_id) then raise exception 'Section not found'; end if;
  update public.assessments
  set status = 'finalized', finalized_by = coalesce(finalized_by, auth.uid()), finalized_at = coalesce(finalized_at, now())
  where section_id = p_section_id and status <> 'finalized';
  get diagnostics v_count = row_count;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), public.current_role(), 'lock', 'marks', p_section_id::text, jsonb_build_object('assessments_locked', v_count));
  return v_count;
end; $$;
revoke all on function public.lock_marks_for_section(uuid) from public;
grant execute on function public.lock_marks_for_section(uuid) to authenticated;
