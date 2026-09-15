-- Forward-only production authorization and workflow hardening.

create or replace function public.can_send_direct_message(p_sender uuid, p_recipient uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select p_sender <> p_recipient
    and sender.status = 'active'
    and recipient.status = 'active'
    and sender.department_id is not null
    and sender.department_id = recipient.department_id
    and sender.role in ('hod', 'faculty')
    and recipient.role in ('hod', 'faculty')
    and sender.role <> recipient.role
  from public.profiles sender
  join public.profiles recipient on recipient.id = p_recipient
  where sender.id = p_sender
$$;

revoke all on function public.can_send_direct_message(uuid, uuid) from public;
grant execute on function public.can_send_direct_message(uuid, uuid) to authenticated;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (
  (sender_id = auth.uid() and public.can_send_direct_message(sender_id, recipient_id))
  or (recipient_id = auth.uid() and public.can_send_direct_message(sender_id, recipient_id))
);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and public.can_send_direct_message(sender_id, recipient_id)
);
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
using (recipient_id = auth.uid() and public.can_send_direct_message(sender_id, recipient_id))
with check (recipient_id = auth.uid() and public.can_send_direct_message(sender_id, recipient_id));
revoke update on public.messages from authenticated;
grant update (read_at, archived_at) on public.messages to authenticated;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (
  public.current_role() = 'super_admin'
  or (
    public.current_role() = 'hod'
    and actor_id is not null
    and exists (
      select 1 from public.profiles actor
      where actor.id = actor_id
        and actor.department_id = public.current_department_id()
    )
  )
);

create or replace function public.can_review_request(p_request_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when actor.status <> 'active' then false
    when actor.role = 'super_admin' then true
    when actor.department_id is distinct from requester.department_id then false
    when actor.role = 'hod' then true
    when actor.role = 'faculty' and request.request_type in ('student_leave', 'gate_pass') then
      public.is_class_teacher(requester.section_id)
    when actor.role = 'faculty' and request.request_type = 'od' then exists (
      select 1 from public.faculty_assignments assignment
      where assignment.faculty_id = actor.id
        and assignment.section_id = requester.section_id
        and assignment.is_active
    )
    else false
  end
  from public.requests request
  join public.profiles requester on requester.id = request.requester_id
  join public.profiles actor on actor.id = auth.uid()
  where request.id = p_request_id
$$;

revoke all on function public.can_review_request(uuid) from public;
grant execute on function public.can_review_request(uuid) to authenticated;

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select to authenticated using (
  requester_id = auth.uid() or public.can_review_request(id)
);
drop policy if exists request_history_select on public.request_history;
create policy request_history_select on public.request_history for select to authenticated using (
  exists (
    select 1 from public.requests request
    where request.id = request_id
      and (request.requester_id = auth.uid() or public.can_review_request(request.id))
  )
);

create or replace function public.transition_request_status(
  p_request_id uuid,
  p_new_status public.request_status,
  p_comments text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  request public.requests;
  actor public.profiles;
  requester public.profiles;
  allowed boolean := false;
  approval_level smallint;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or actor.status <> 'active' then raise exception 'An active profile is required'; end if;

  select * into request from public.requests where id = p_request_id for update;
  if not found or request.is_locked then raise exception 'Request is unavailable for transition'; end if;
  select * into requester from public.profiles where id = request.requester_id;

  if request.request_type in ('student_leave','gate_pass') and request.status = 'submitted' and p_new_status in ('class_teacher_approved','rejected') then
    allowed := actor.department_id is not distinct from requester.department_id and public.is_class_teacher(requester.section_id); approval_level := 1;
  elsif request.request_type in ('student_leave','gate_pass') and request.status = 'class_teacher_approved' and p_new_status in ('hod_approved','hod_rejected') then
    allowed := actor.role = 'hod' and actor.department_id is not distinct from requester.department_id; approval_level := 2;
  elsif request.request_type = 'staff_leave' and request.status = 'submitted' and p_new_status in ('hod_approved','hod_rejected') then
    allowed := actor.role = 'hod' and actor.department_id is not distinct from requester.department_id; approval_level := 1;
  elsif request.request_type = 'od' and request.status = 'submitted' and p_new_status in ('faculty_approved','faculty_rejected') then
    allowed := actor.role = 'faculty' and actor.department_id is not distinct from requester.department_id
      and exists (select 1 from public.faculty_assignments a where a.faculty_id = actor.id and a.section_id = requester.section_id and a.is_active); approval_level := 1;
  elsif request.request_type = 'od' and request.status = 'faculty_approved' and p_new_status in ('provisional_approved','hod_rejected') then
    allowed := actor.role = 'hod' and actor.department_id is not distinct from requester.department_id; approval_level := 2;
  elsif request.request_type = 'od' and request.status = 'provisional_approved' and p_new_status = 'certificate_pending' then
    allowed := request.requester_id = auth.uid(); approval_level := 2;
  elsif request.request_type = 'od' and request.status = 'certificate_pending' and p_new_status in ('certificate_verified','faculty_rejected') then
    allowed := actor.role = 'faculty' and actor.department_id is not distinct from requester.department_id
      and exists (select 1 from public.faculty_assignments a where a.faculty_id = actor.id and a.section_id = requester.section_id and a.is_active); approval_level := 3;
  elsif request.request_type = 'od' and request.status = 'certificate_verified' and p_new_status = 'finalized' then
    allowed := actor.role = 'hod' and actor.department_id is not distinct from requester.department_id; approval_level := 4;
  end if;

  if not allowed then raise exception 'Invalid request transition for caller'; end if;
  update public.requests set status = p_new_status, current_approval_level = approval_level,
    is_locked = p_new_status in ('hod_approved','hod_rejected','finalized','rejected') where id = request.id;
  insert into public.request_history(request_id, actor_id, actor_role, action, previous_status, new_status, comments)
  values (request.id, auth.uid(), actor.role, 'transition', request.status, p_new_status, p_comments);
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), actor.role, 'transition', 'request', request.id::text, jsonb_build_object('status', p_new_status));
end; $$;

revoke all on function public.transition_request_status(uuid, public.request_status, text) from public;
grant execute on function public.transition_request_status(uuid, public.request_status, text) to authenticated;

create or replace function public.approve_mark_correction(p_correction_id uuid, p_approve boolean, p_comments text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  correction public.mark_corrections;
  assessment public.assessments;
  actor public.profiles;
  assessment_department uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or actor.status <> 'active' then raise exception 'An active profile is required'; end if;
  select * into correction from public.mark_corrections where id = p_correction_id for update;
  if not found or correction.status <> 'pending' then raise exception 'Pending mark correction not found'; end if;
  select a.* into assessment
  from public.marks mark
  join public.assessments a on a.id = mark.assessment_id
  where mark.id = correction.mark_id;
  select section.department_id into assessment_department
  from public.sections section where section.id = assessment.section_id;
  if not (
    (assessment.faculty_id = auth.uid() and public.can_teach(assessment.section_id, assessment.subject_id))
    or actor.role = 'super_admin'
    or (actor.role = 'hod' and actor.department_id = assessment_department)
  ) then raise exception 'Not authorized to review this correction'; end if;
  update public.mark_corrections set status = (case when p_approve then 'approved' else 'rejected' end)::public.correction_status,
    reviewer_id = auth.uid(), reviewer_comments = p_comments, reviewed_at = now() where id = correction.id;
  if p_approve then
    perform set_config('app.correction_write', 'on', true);
    update public.marks set obtained_marks = correction.requested_marks, absent = correction.requested_marks is null where id = correction.mark_id;
  end if;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), actor.role, case when p_approve then 'approve' else 'reject' end, 'mark_correction', correction.id::text,
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end));
end; $$;

revoke all on function public.approve_mark_correction(uuid, boolean, text) from public;
grant execute on function public.approve_mark_correction(uuid, boolean, text) to authenticated;

create or replace function public.student_daily_check_in(p_session_id uuid)
returns public.attendance_records
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  profile public.profiles;
  attendance_session public.attendance_sessions;
  attendance_record public.attendance_records;
  checked_in_at timestamptz := now();
  local_now timestamp := now() at time zone 'Asia/Kolkata';
begin
  select * into profile from public.profiles where id = auth.uid() for share;
  if not found or profile.role <> 'student' or profile.status <> 'active' then
    raise exception 'Only an active student profile can submit a daily check-in';
  end if;
  if local_now::time < time '09:00' or local_now::time > time '09:45' then
    raise exception 'Daily check-in is available from 09:00 through 09:45 Asia/Kolkata';
  end if;
  select * into attendance_session from public.attendance_sessions where id = p_session_id for share;
  if not found or attendance_session.session_type <> 'daily' or attendance_session.status <> 'open' then
    raise exception 'Daily attendance is not open for check-in';
  end if;
  if attendance_session.attendance_date <> local_now::date or profile.section_id is distinct from attendance_session.section_id then
    raise exception 'This daily attendance session is not available to the current student';
  end if;
  if not exists (select 1 from public.enrollments enrollment where enrollment.student_id = auth.uid()
    and enrollment.section_id = attendance_session.section_id and enrollment.status = 'active') then
    raise exception 'The current student has no active enrollment for this daily attendance session';
  end if;
  insert into public.attendance_records(session_id, student_id, status, check_in_time, verification_data)
  values (attendance_session.id, auth.uid(), 'present', checked_in_at,
    jsonb_build_object('source', 'student_check_in', 'verification_state', 'pending', 'submitted_at', checked_in_at))
  on conflict (session_id, student_id) do nothing returning * into attendance_record;
  if not found then raise exception 'A daily check-in has already been submitted for this session'; end if;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), profile.role, 'student_daily_check_in', 'attendance', attendance_record.id::text,
    jsonb_build_object('session_id', attendance_session.id));
  return attendance_record;
end; $$;

revoke all on function public.student_daily_check_in(uuid) from public;
grant execute on function public.student_daily_check_in(uuid) to authenticated;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using (
  owner_id = auth.uid()
  or public.can_manage_department((select p.department_id from public.profiles p where p.id = owner_id))
  or faculty_reviewer_id = auth.uid()
  or jury_reviewer_id = auth.uid()
  or (entity_type = 'announcement' and exists (
    select 1 from public.announcements announcement
    where announcement.id = entity_id
      and public.can_access_announcement(announcement.audience, announcement.target, announcement.department_id)
  ))
);

drop policy if exists private_document_read on storage.objects;
create policy private_document_read on storage.objects for select to authenticated using (
  owner_id = (select auth.uid()::text)
  or exists (
    select 1 from public.attachments attachment
    join public.profiles owner on owner.id = attachment.owner_id
    where attachment.bucket_id = storage.objects.bucket_id and attachment.object_path = storage.objects.name
      and (
        public.can_manage_department(owner.department_id)
        or attachment.faculty_reviewer_id = auth.uid()
        or attachment.jury_reviewer_id = auth.uid()
        or (attachment.entity_type = 'announcement' and exists (
          select 1 from public.announcements announcement
          where announcement.id = attachment.entity_id
            and public.can_access_announcement(announcement.audience, announcement.target, announcement.department_id)
        ))
      )
  )
);

-- Notifications are intentionally retired from production without deleting historical data.
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
revoke all on public.notifications from authenticated;
