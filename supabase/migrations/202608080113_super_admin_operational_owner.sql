-- Make Super Admin the operational owner while keeping HOD read/monitor access.
-- HOD can still view department-scoped data through select policies and can_view_section,
-- but create/edit/approve/lock/finalize manager paths belong to Super Admin.

create or replace function public.can_manage_department(department uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.current_role() = 'super_admin' $$;

create or replace function public.can_access_announcement(audience text, target jsonb, department uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.current_department_id() = department and (
    public.current_role() in ('super_admin','hod')
    or audience = 'department'
    or (audience = 'faculty' and public.current_role() in ('faculty','hod','super_admin'))
    or (audience = 'students' and public.current_role() = 'student')
    or (audience = 'lab_assistants' and public.current_role() = 'lab_assistant')
    or (audience = 'section' and (target ->> 'section_id')::uuid = (select section_id from public.profiles where id = auth.uid()))
    or (audience = 'assigned_students' and exists (select 1 from jsonb_array_elements_text(coalesce(target -> 'profile_ids', '[]'::jsonb)) v where v::uuid = auth.uid()))
  )
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.can_manage_department(department_id)
  or (
    public.current_department_id() = department_id
    and public.current_role() in ('hod','faculty','lab_assistant')
  )
);

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
using (
  author_id = auth.uid()
  or public.can_manage_department(department_id)
)
with check (
  (author_id = auth.uid() and public.current_role() in ('faculty','hod','super_admin'))
  or public.can_manage_department(department_id)
);

drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints for select to authenticated
using (
  student_id = auth.uid()
  or assigned_to = auth.uid()
  or public.can_manage_department(department_id)
  or (public.current_role() = 'hod' and department_id = public.current_department_id())
);

drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints for update to authenticated
using (
  assigned_to = auth.uid()
  or public.can_manage_department(department_id)
  or (public.current_role() = 'hod' and department_id = public.current_department_id())
)
with check (
  assigned_to = auth.uid()
  or public.can_manage_department(department_id)
  or (public.current_role() = 'hod' and department_id = public.current_department_id())
);

drop policy if exists staff_attendance_write on public.staff_attendance;
create policy staff_attendance_write on public.staff_attendance for all to authenticated
using (
  profile_id = auth.uid()
  or public.current_role() = 'super_admin'
)
with check (
  profile_id = auth.uid()
  or public.current_role() = 'super_admin'
);

drop policy if exists assessments_write on public.assessments;

drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert on public.assessments for insert to authenticated
with check (
  public.current_role() = 'super_admin'
);

drop policy if exists assessments_update on public.assessments;
create policy assessments_update on public.assessments for update to authenticated
using (
  (public.can_teach(section_id, subject_id) and status <> 'finalized')
  or public.current_role() = 'super_admin'
)
with check (
  (public.can_teach(section_id, subject_id) and status <> 'finalized')
  or public.current_role() = 'super_admin'
);

drop policy if exists assessments_delete on public.assessments;
create policy assessments_delete on public.assessments for delete to authenticated
using (
  public.current_role() = 'super_admin'
);

create or replace function public.approve_attendance_correction(
  p_correction_id uuid,
  p_approve boolean,
  p_comments text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.attendance_corrections; sid uuid;
begin
  select * into c from public.attendance_corrections where id = p_correction_id for update;
  if not found or c.status <> 'pending' then raise exception 'Pending attendance correction not found'; end if;
  select session_id into sid from public.attendance_records where id = c.attendance_record_id;
  if not (
    public.can_teach(
      (select section_id from public.attendance_sessions where id = sid),
      (select subject_id from public.attendance_sessions where id = sid)
    )
    or public.current_role() = 'super_admin'
  ) then
    raise exception 'Not authorized to review this correction';
  end if;
  update public.attendance_corrections
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewer_id = auth.uid(),
      reviewer_comments = p_comments,
      reviewed_at = now()
  where id = c.id;
  if p_approve then
    perform set_config('app.correction_write', 'on', true);
    update public.attendance_records set status = c.requested_status where id = c.attendance_record_id;
  end if;
end; $$;

create or replace function public.finalize_marks(
  p_assessment_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.assessments;
begin
  select * into a from public.assessments where id = p_assessment_id for update;
  if not found then raise exception 'Assessment not found'; end if;
  if not (
    (a.faculty_id = auth.uid() and public.can_teach(a.section_id, a.subject_id))
    or public.current_role() = 'super_admin'
  ) then
    raise exception 'Not authorized to finalize these marks';
  end if;
  if a.status = 'finalized' then raise exception 'Marks already finalized'; end if;
  if exists (
    select 1
    from public.enrollments e
    where e.section_id = a.section_id
      and e.status = 'active'
      and not exists (
        select 1
        from public.marks m
        where m.assessment_id = a.id
          and m.student_id = e.student_id
      )
  ) then
    raise exception 'Every active student must have a mark record';
  end if;
  update public.marks set is_locked = true where assessment_id = a.id;
  update public.assessments
  set status = 'finalized',
      finalized_by = auth.uid(),
      finalized_at = now()
  where id = a.id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference)
  values (auth.uid(), public.current_role(), 'finalize', 'marks', p_assessment_id::text);
end; $$;

create or replace function public.approve_mark_correction(
  p_correction_id uuid,
  p_approve boolean,
  p_comments text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.mark_corrections; v_assessment public.assessments;
begin
  select * into c from public.mark_corrections where id = p_correction_id for update;
  if not found or c.status <> 'pending' then raise exception 'Pending mark correction not found'; end if;
  select assessment.* into v_assessment
  from public.marks mark
  join public.assessments assessment on assessment.id = mark.assessment_id
  where mark.id = c.mark_id;
  if not (
    (v_assessment.faculty_id = auth.uid() and public.can_teach(v_assessment.section_id, v_assessment.subject_id))
    or public.current_role() = 'super_admin'
  ) then
    raise exception 'Not authorized to review this correction';
  end if;
  update public.mark_corrections
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.correction_status,
      reviewer_id = auth.uid(),
      reviewer_comments = p_comments,
      reviewed_at = now()
  where id = c.id;
  if p_approve then
    perform set_config('app.correction_write', 'on', true);
    update public.marks
    set obtained_marks = c.requested_marks,
        absent = c.requested_marks is null
    where id = c.mark_id;
  end if;
end; $$;

create or replace function public.transition_request_status(
  p_request_id uuid,
  p_new_status public.request_status,
  p_comments text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.requests; actor public.app_role := public.current_role(); allowed boolean := false; level smallint;
begin
  select * into r from public.requests where id = p_request_id for update;
  if not found or r.is_locked then raise exception 'Request is unavailable for transition'; end if;
  if r.request_type in ('student_leave','gate_pass') and r.status = 'submitted' and p_new_status in ('class_teacher_approved','rejected') then allowed := public.is_class_teacher((select section_id from public.profiles where id = r.requester_id)); level := 1;
  elsif r.request_type in ('student_leave','gate_pass') and r.status = 'class_teacher_approved' and p_new_status in ('hod_approved','hod_rejected') then allowed := actor in ('super_admin','hod'); level := 2;
  elsif r.request_type = 'staff_leave' and r.status = 'submitted' and p_new_status in ('hod_approved','hod_rejected') then allowed := actor in ('super_admin','hod'); level := 1;
  elsif r.request_type = 'od' and r.status = 'submitted' and p_new_status in ('faculty_approved','faculty_rejected') then allowed := actor = 'faculty'; level := 1;
  elsif r.request_type = 'od' and r.status = 'faculty_approved' and p_new_status in ('provisional_approved','hod_rejected') then allowed := actor in ('super_admin','hod'); level := 2;
  elsif r.request_type = 'od' and r.status = 'provisional_approved' and p_new_status = 'certificate_pending' then allowed := r.requester_id = auth.uid(); level := 2;
  elsif r.request_type = 'od' and r.status = 'certificate_pending' and p_new_status in ('certificate_verified','faculty_rejected') then allowed := actor = 'faculty'; level := 3;
  elsif r.request_type = 'od' and r.status = 'certificate_verified' and p_new_status = 'finalized' then allowed := actor in ('super_admin','hod'); level := 4;
  end if;
  if not allowed then raise exception 'Invalid request transition for caller'; end if;
  update public.requests
  set status = p_new_status,
      current_approval_level = level,
      is_locked = p_new_status in ('hod_approved','hod_rejected','finalized','rejected')
  where id = r.id;
  insert into public.request_history(request_id, actor_id, actor_role, action, previous_status, new_status, comments)
  values (r.id, auth.uid(), actor, 'transition', r.status, p_new_status, p_comments);
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference)
  values (auth.uid(), actor, 'approve', 'request', r.id::text);
end; $$;
