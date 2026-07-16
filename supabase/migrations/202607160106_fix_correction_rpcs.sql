-- Correct enum typing and PL/pgSQL name resolution in correction approval RPCs.

create or replace function public.approve_attendance_correction(p_correction_id uuid, p_approve boolean, p_comments text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.attendance_corrections; sid uuid;
begin
  select * into c from public.attendance_corrections where id = p_correction_id for update;
  if not found or c.status <> 'pending' then raise exception 'Pending attendance correction not found'; end if;
  select session_id into sid from public.attendance_records where id = c.attendance_record_id;
  if not (public.can_teach((select section_id from public.attendance_sessions where id = sid), (select subject_id from public.attendance_sessions where id = sid)) or public.has_role(array['hod','super_admin']::public.app_role[])) then raise exception 'Not authorized to review this correction'; end if;
  update public.attendance_corrections set status = (case when p_approve then 'approved' else 'rejected' end)::public.correction_status, reviewer_id = auth.uid(), reviewer_comments = p_comments, reviewed_at = now() where id = c.id;
  if p_approve then perform set_config('app.correction_write', 'on', true); update public.attendance_records set status = c.requested_status where id = c.attendance_record_id; end if;
end; $$;

create or replace function public.approve_mark_correction(p_correction_id uuid, p_approve boolean, p_comments text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.mark_corrections; v_assessment public.assessments;
begin
  select * into c from public.mark_corrections where id = p_correction_id for update;
  if not found or c.status <> 'pending' then raise exception 'Pending mark correction not found'; end if;
  select assessment.* into v_assessment from public.marks mark join public.assessments assessment on assessment.id = mark.assessment_id where mark.id = c.mark_id;
  if not (v_assessment.faculty_id = auth.uid() and public.can_teach(v_assessment.section_id, v_assessment.subject_id)) then raise exception 'Not authorized to review this correction'; end if;
  update public.mark_corrections set status = (case when p_approve then 'approved' else 'rejected' end)::public.correction_status, reviewer_id = auth.uid(), reviewer_comments = p_comments, reviewed_at = now() where id = c.id;
  if p_approve then perform set_config('app.correction_write', 'on', true); update public.marks set obtained_marks = c.requested_marks, absent = c.requested_marks is null where id = c.mark_id; end if;
end; $$;

revoke all on function public.approve_attendance_correction(uuid, boolean, text) from public;
revoke all on function public.approve_mark_correction(uuid, boolean, text) from public;
grant execute on function public.approve_attendance_correction(uuid, boolean, text), public.approve_mark_correction(uuid, boolean, text) to authenticated;
