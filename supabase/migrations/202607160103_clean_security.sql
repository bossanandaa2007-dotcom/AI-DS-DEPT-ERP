-- RLS and privileged workflow operations.  No application table is reachable by anon.
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select auth.uid() $$;
create or replace function public.current_role() returns public.app_role
language sql stable security definer set search_path = public, pg_temp
as $$ select role from public.profiles where id = auth.uid() $$;
create or replace function public.current_department_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select department_id from public.profiles where id = auth.uid() $$;
create or replace function public.has_role(roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select auth.uid() is not null and public.current_role() = any(roles) $$;
create or replace function public.can_manage_department(department uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.has_role(array['super_admin','hod']::public.app_role[]) and (public.current_role() = 'super_admin' or public.current_department_id() = department) $$;
create or replace function public.can_update_own_profile(candidate public.profiles) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select candidate.id = auth.uid()
    and candidate.role = p.role
    and candidate.status = p.status
    and candidate.department_id is not distinct from p.department_id
    and candidate.section_id is not distinct from p.section_id
    and candidate.employee_or_register_number is not distinct from p.employee_or_register_number
    and candidate.designation is not distinct from p.designation
    and candidate.faculty_responsibilities is not distinct from p.faculty_responsibilities
  from public.profiles p where p.id = auth.uid()
$$;
create or replace function public.can_view_section(section uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.section_id = section)
  or exists (select 1 from public.faculty_assignments fa where fa.faculty_id = auth.uid() and fa.section_id = section and fa.is_active)
  or public.has_role(array['super_admin','hod']::public.app_role[])
$$;
create or replace function public.is_class_teacher(section uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.faculty_assignments where faculty_id = auth.uid() and section_id = section and assignment_type = 'class_teacher' and is_active) $$;
create or replace function public.can_teach(section uuid, subject uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.faculty_assignments where faculty_id = auth.uid() and section_id = section and (subject_id = subject or assignment_type = 'class_teacher') and is_active) $$;
create or replace function public.can_access_announcement(audience text, target jsonb, department uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.can_manage_department(department)
    or (public.current_department_id() = department and (
      audience = 'department'
      or (audience = 'faculty' and public.current_role() in ('faculty','hod','super_admin'))
      or (audience = 'students' and public.current_role() = 'student')
      or (audience = 'lab_assistants' and public.current_role() = 'lab_assistant')
      or (audience = 'section' and (target ->> 'section_id')::uuid = (select section_id from public.profiles where id = auth.uid()))
      or (audience = 'assigned_students' and exists (select 1 from jsonb_array_elements_text(coalesce(target -> 'profile_ids', '[]'::jsonb)) v where v::uuid = auth.uid()))
    ))
$$;

-- Lock finalized source records; correction RPCs set this transaction-local flag.
create or replace function public.prevent_finalized_attendance_change() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.attendance_sessions s where s.id = coalesce(new.session_id, old.session_id) and s.status in ('finalized','locked'))
     and current_setting('app.correction_write', true) is distinct from 'on' then
    raise exception 'Finalized attendance may only be changed through an approved correction';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create or replace function public.prevent_finalized_mark_change() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.marks m join public.assessments a on a.id = m.assessment_id where m.id = coalesce(new.id, old.id) and a.status = 'finalized')
     and current_setting('app.correction_write', true) is distinct from 'on' then
    raise exception 'Finalized marks may only be changed through an approved correction';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists attendance_records_finalized_guard on public.attendance_records;
create trigger attendance_records_finalized_guard before update or delete on public.attendance_records for each row execute procedure public.prevent_finalized_attendance_change();
drop trigger if exists marks_finalized_guard on public.marks;
create trigger marks_finalized_guard before update or delete on public.marks for each row execute procedure public.prevent_finalized_mark_change();

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.academic_years enable row level security;
alter table public.semesters enable row level security;
alter table public.sections enable row level security;
alter table public.subjects enable row level security;
alter table public.enrollments enable row level security;
alter table public.faculty_assignments enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.staff_attendance enable row level security;
alter table public.assessments enable row level security;
alter table public.marks enable row level security;
alter table public.mark_corrections enable row level security;
alter table public.requests enable row level security;
alter table public.request_history enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.competitions enable row level security;
alter table public.attachments enable row level security;
alter table public.portion_updates enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.complaints enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select to authenticated using (id = public.current_department_id() or public.has_role(array['super_admin']::public.app_role[]));
drop policy if exists departments_admin on public.departments;
create policy departments_admin on public.departments for all to authenticated using (public.has_role(array['super_admin']::public.app_role[])) with check (public.has_role(array['super_admin']::public.app_role[]));
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.can_manage_department(department_id) or (public.current_department_id() = department_id and public.current_role() in ('faculty','lab_assistant')));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (public.can_update_own_profile(profiles));
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all to authenticated using (public.can_manage_department(department_id)) with check (public.can_manage_department(department_id));

drop policy if exists academic_years_select on public.academic_years;
create policy academic_years_select on public.academic_years for select to authenticated using (department_id = public.current_department_id() or public.has_role(array['super_admin']::public.app_role[]));
drop policy if exists academic_years_admin on public.academic_years;
create policy academic_years_admin on public.academic_years for all to authenticated using (public.can_manage_department(department_id)) with check (public.can_manage_department(department_id));
drop policy if exists semesters_select on public.semesters;
create policy semesters_select on public.semesters for select to authenticated using (exists (select 1 from public.academic_years y where y.id = academic_year_id and (y.department_id = public.current_department_id() or public.has_role(array['super_admin']::public.app_role[]))));
drop policy if exists semesters_admin on public.semesters;
create policy semesters_admin on public.semesters for all to authenticated using (exists (select 1 from public.academic_years y where y.id = academic_year_id and public.can_manage_department(y.department_id))) with check (exists (select 1 from public.academic_years y where y.id = academic_year_id and public.can_manage_department(y.department_id)));
drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections for select to authenticated using (public.can_view_section(id));
drop policy if exists sections_admin on public.sections;
create policy sections_admin on public.sections for all to authenticated using (public.can_manage_department(department_id)) with check (public.can_manage_department(department_id));
drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects for select to authenticated using (department_id = public.current_department_id() or public.has_role(array['super_admin']::public.app_role[]));
drop policy if exists subjects_admin on public.subjects;
create policy subjects_admin on public.subjects for all to authenticated using (public.can_manage_department(department_id)) with check (public.can_manage_department(department_id));
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select to authenticated using (student_id = auth.uid() or public.can_view_section(section_id));
drop policy if exists enrollments_admin on public.enrollments;
create policy enrollments_admin on public.enrollments for all to authenticated using (public.can_manage_department((select department_id from public.sections s where s.id = section_id))) with check (public.can_manage_department((select department_id from public.sections s where s.id = section_id)));
drop policy if exists faculty_assignments_select on public.faculty_assignments;
create policy faculty_assignments_select on public.faculty_assignments for select to authenticated using (faculty_id = auth.uid() or public.can_view_section(section_id));
drop policy if exists faculty_assignments_admin on public.faculty_assignments;
create policy faculty_assignments_admin on public.faculty_assignments for all to authenticated using (public.can_manage_department((select department_id from public.sections s where s.id = section_id))) with check (public.can_manage_department((select department_id from public.sections s where s.id = section_id)));
drop policy if exists timetable_entries_select on public.timetable_entries;
create policy timetable_entries_select on public.timetable_entries for select to authenticated using (public.can_view_section(section_id));
drop policy if exists timetable_entries_admin on public.timetable_entries;
create policy timetable_entries_admin on public.timetable_entries for all to authenticated using (public.can_manage_department((select department_id from public.sections s where s.id = section_id))) with check (public.can_manage_department((select department_id from public.sections s where s.id = section_id)));

drop policy if exists attendance_sessions_select on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions for select to authenticated using (public.can_view_section(section_id));
drop policy if exists attendance_sessions_faculty_write on public.attendance_sessions;
create policy attendance_sessions_faculty_write on public.attendance_sessions for insert to authenticated with check (public.can_teach(section_id, subject_id) and faculty_id = auth.uid());
drop policy if exists attendance_sessions_faculty_update on public.attendance_sessions;
create policy attendance_sessions_faculty_update on public.attendance_sessions for update to authenticated using ((faculty_id = auth.uid() and status not in ('finalized','locked')) or public.can_manage_department((select department_id from public.sections where id = section_id))) with check ((faculty_id = auth.uid() and status not in ('finalized','locked')) or public.can_manage_department((select department_id from public.sections where id = section_id)));
drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records for select to authenticated using (student_id = auth.uid() or exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_teach(s.section_id, s.subject_id)) or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists attendance_records_write on public.attendance_records;
create policy attendance_records_write on public.attendance_records for all to authenticated using (exists (select 1 from public.attendance_sessions s where s.id = session_id and s.status in ('draft','open') and public.can_teach(s.section_id, s.subject_id))) with check (exists (select 1 from public.attendance_sessions s where s.id = session_id and s.status in ('draft','open') and public.can_teach(s.section_id, s.subject_id)));
drop policy if exists attendance_corrections_select on public.attendance_corrections;
create policy attendance_corrections_select on public.attendance_corrections for select to authenticated using (requester_id = auth.uid() or reviewer_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists attendance_corrections_insert on public.attendance_corrections;
create policy attendance_corrections_insert on public.attendance_corrections for insert to authenticated with check (requester_id = auth.uid() and student_id = auth.uid());
drop policy if exists staff_attendance_select on public.staff_attendance;
create policy staff_attendance_select on public.staff_attendance for select to authenticated using (profile_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists staff_attendance_write on public.staff_attendance;
create policy staff_attendance_write on public.staff_attendance for all to authenticated using (profile_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[])) with check (profile_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]));

drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments for select to authenticated using (public.can_view_section(section_id));
drop policy if exists assessments_write on public.assessments;
create policy assessments_write on public.assessments for all to authenticated using ((faculty_id = auth.uid() and public.can_teach(section_id, subject_id) and status <> 'finalized') or public.has_role(array['super_admin','hod']::public.app_role[])) with check ((faculty_id = auth.uid() and public.can_teach(section_id, subject_id) and status <> 'finalized') or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists marks_select on public.marks;
create policy marks_select on public.marks for select to authenticated using (student_id = auth.uid() or exists (select 1 from public.assessments a where a.id = assessment_id and public.can_teach(a.section_id, a.subject_id)) or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists marks_write on public.marks;
create policy marks_write on public.marks for all to authenticated using (exists (select 1 from public.assessments a where a.id = assessment_id and a.status <> 'finalized' and public.can_teach(a.section_id, a.subject_id))) with check (exists (select 1 from public.assessments a where a.id = assessment_id and a.status <> 'finalized' and public.can_teach(a.section_id, a.subject_id)));
drop policy if exists mark_corrections_select on public.mark_corrections;
create policy mark_corrections_select on public.mark_corrections for select to authenticated using (requester_id = auth.uid() or reviewer_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists mark_corrections_insert on public.mark_corrections;
create policy mark_corrections_insert on public.mark_corrections for insert to authenticated with check (requester_id = auth.uid() and student_id = auth.uid());

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select to authenticated using (requester_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]) or (request_type in ('student_leave','gate_pass') and public.is_class_teacher((select section_id from public.profiles where id = requester_id))) or (request_type = 'od' and public.current_role() = 'faculty'));
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated with check (requester_id = auth.uid() and not is_locked);
drop policy if exists requests_update_self on public.requests;
create policy requests_update_self on public.requests for update to authenticated using (requester_id = auth.uid() and status in ('draft','submitted') and not is_locked) with check (requester_id = auth.uid() and status in ('draft','submitted') and not is_locked);
drop policy if exists request_history_select on public.request_history;
create policy request_history_select on public.request_history for select to authenticated using (exists (select 1 from public.requests r where r.id = request_id and (r.requester_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]) or public.current_role() = 'faculty')));
drop policy if exists request_history_insert on public.request_history;
create policy request_history_insert on public.request_history for insert to authenticated with check (actor_id = auth.uid());
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (public.can_manage_department(department_id) or faculty_guide_id = auth.uid() or exists (select 1 from public.project_members m where m.project_id = id and m.student_id = auth.uid()));
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for all to authenticated using (public.can_manage_department(department_id) or faculty_guide_id = auth.uid()) with check (public.can_manage_department(department_id) or faculty_guide_id = auth.uid());
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members for select to authenticated using (student_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and (p.faculty_guide_id = auth.uid() or public.can_manage_department(p.department_id))));
drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members for all to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.faculty_guide_id = auth.uid() or public.can_manage_department(p.department_id)))) with check (exists (select 1 from public.projects p where p.id = project_id and (p.faculty_guide_id = auth.uid() or public.can_manage_department(p.department_id))));
drop policy if exists competitions_select on public.competitions;
create policy competitions_select on public.competitions for select to authenticated using (department_id = public.current_department_id() or public.has_role(array['super_admin']::public.app_role[]));
drop policy if exists competitions_admin on public.competitions;
create policy competitions_admin on public.competitions for all to authenticated using (public.can_manage_department(department_id)) with check (public.can_manage_department(department_id));
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using (owner_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated using (owner_id = auth.uid() and not exists (select 1 from public.requests r where r.id = entity_id and r.is_locked));
drop policy if exists portion_updates_select on public.portion_updates;
create policy portion_updates_select on public.portion_updates for select to authenticated using (public.can_view_section(section_id));
drop policy if exists portion_updates_write on public.portion_updates;
create policy portion_updates_write on public.portion_updates for all to authenticated using (faculty_id = auth.uid() and public.can_teach(section_id, subject_id)) with check (faculty_id = auth.uid() and public.can_teach(section_id, subject_id));
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using (public.can_access_announcement(audience, target, department_id));
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated using (author_id = auth.uid() or public.can_manage_department(department_id)) with check (author_id = auth.uid() and public.current_role() in ('faculty','hod','super_admin') or public.can_manage_department(department_id));
drop policy if exists announcement_reads_select on public.announcement_reads;
create policy announcement_reads_select on public.announcement_reads for select to authenticated using (profile_id = auth.uid() or public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists announcement_reads_write on public.announcement_reads;
create policy announcement_reads_write on public.announcement_reads for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints for select to authenticated using (student_id = auth.uid() or assigned_to = auth.uid() or public.can_manage_department(department_id));
drop policy if exists complaints_insert on public.complaints;
create policy complaints_insert on public.complaints for insert to authenticated with check (student_id = auth.uid() and department_id = public.current_department_id());
drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints for update to authenticated using (assigned_to = auth.uid() or public.can_manage_department(department_id)) with check (assigned_to = auth.uid() or public.can_manage_department(department_id));
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (sender_id = auth.uid());
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.has_role(array['super_admin','hod']::public.app_role[]));
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (actor_id = auth.uid());

create or replace function public.finalize_attendance_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.attendance_sessions;
begin
  select * into s from public.attendance_sessions where id = p_session_id for update;
  if not found then raise exception 'Attendance session not found'; end if;
  if not (s.faculty_id = auth.uid() or public.can_teach(s.section_id, s.subject_id) or public.can_manage_department((select department_id from public.sections where id = s.section_id))) then raise exception 'Not authorized to finalize this attendance session'; end if;
  if s.status not in ('draft','open') then raise exception 'Attendance session is already finalized'; end if;
  update public.attendance_sessions set status = 'finalized', finalized_by = auth.uid(), finalized_at = now() where id = p_session_id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference) values (auth.uid(), public.current_role(), 'finalize', 'attendance', p_session_id::text);
end; $$;
create or replace function public.approve_attendance_correction(p_correction_id uuid, p_approve boolean, p_comments text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.attendance_corrections; sid uuid;
begin
  select * into c from public.attendance_corrections where id = p_correction_id for update;
  if not found or c.status <> 'pending' then raise exception 'Pending attendance correction not found'; end if;
  select session_id into sid from public.attendance_records where id = c.attendance_record_id;
  if not (public.can_teach((select section_id from public.attendance_sessions where id = sid), (select subject_id from public.attendance_sessions where id = sid)) or public.has_role(array['hod','super_admin']::public.app_role[])) then raise exception 'Not authorized to review this correction'; end if;
  update public.attendance_corrections set status = case when p_approve then 'approved' else 'rejected' end, reviewer_id = auth.uid(), reviewer_comments = p_comments, reviewed_at = now() where id = c.id;
  if p_approve then perform set_config('app.correction_write', 'on', true); update public.attendance_records set status = c.requested_status where id = c.attendance_record_id; end if;
end; $$;
create or replace function public.finalize_marks(p_assessment_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.assessments;
begin
  select * into a from public.assessments where id = p_assessment_id for update;
  if not found then raise exception 'Assessment not found'; end if;
  if not (a.faculty_id = auth.uid() and public.can_teach(a.section_id, a.subject_id)) then raise exception 'Not authorized to finalize these marks'; end if;
  if a.status = 'finalized' then raise exception 'Marks already finalized'; end if;
  if exists (select 1 from public.enrollments e where e.section_id = a.section_id and e.status = 'active' and not exists (select 1 from public.marks m where m.assessment_id = a.id and m.student_id = e.student_id)) then raise exception 'Every active student must have a mark record'; end if;
  update public.marks set is_locked = true where assessment_id = a.id;
  update public.assessments set status = 'finalized', finalized_by = auth.uid(), finalized_at = now() where id = a.id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference) values (auth.uid(), public.current_role(), 'finalize', 'marks', p_assessment_id::text);
end; $$;
create or replace function public.approve_mark_correction(p_correction_id uuid, p_approve boolean, p_comments text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.mark_corrections; a public.assessments;
begin
  select * into c from public.mark_corrections where id = p_correction_id for update;
  if not found or c.status <> 'pending' then raise exception 'Pending mark correction not found'; end if;
  select a.* into a from public.marks m join public.assessments a on a.id = m.assessment_id where m.id = c.mark_id;
  if not (a.faculty_id = auth.uid() and public.can_teach(a.section_id, a.subject_id)) then raise exception 'Not authorized to review this correction'; end if;
  update public.mark_corrections set status = case when p_approve then 'approved' else 'rejected' end, reviewer_id = auth.uid(), reviewer_comments = p_comments, reviewed_at = now() where id = c.id;
  if p_approve then perform set_config('app.correction_write', 'on', true); update public.marks set obtained_marks = c.requested_marks, absent = c.requested_marks is null where id = c.mark_id; end if;
end; $$;
create or replace function public.transition_request_status(p_request_id uuid, p_new_status public.request_status, p_comments text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.requests; actor public.app_role := public.current_role(); allowed boolean := false; level smallint;
begin
  select * into r from public.requests where id = p_request_id for update;
  if not found or r.is_locked then raise exception 'Request is unavailable for transition'; end if;
  if r.request_type in ('student_leave','gate_pass') and r.status = 'submitted' and p_new_status in ('class_teacher_approved','rejected') then allowed := public.is_class_teacher((select section_id from public.profiles where id = r.requester_id)); level := 1;
  elsif r.request_type in ('student_leave','gate_pass') and r.status = 'class_teacher_approved' and p_new_status in ('hod_approved','hod_rejected') then allowed := actor = 'hod'; level := 2;
  elsif r.request_type = 'staff_leave' and r.status = 'submitted' and p_new_status in ('hod_approved','hod_rejected') then allowed := actor = 'hod'; level := 1;
  elsif r.request_type = 'od' and r.status = 'submitted' and p_new_status in ('faculty_approved','faculty_rejected') then allowed := actor = 'faculty'; level := 1;
  elsif r.request_type = 'od' and r.status = 'faculty_approved' and p_new_status in ('provisional_approved','hod_rejected') then allowed := actor = 'hod'; level := 2;
  elsif r.request_type = 'od' and r.status = 'provisional_approved' and p_new_status = 'certificate_pending' then allowed := r.requester_id = auth.uid(); level := 2;
  elsif r.request_type = 'od' and r.status = 'certificate_pending' and p_new_status in ('certificate_verified','faculty_rejected') then allowed := actor = 'faculty'; level := 3;
  elsif r.request_type = 'od' and r.status = 'certificate_verified' and p_new_status = 'finalized' then allowed := actor = 'hod'; level := 4;
  end if;
  if not allowed then raise exception 'Invalid request transition for caller'; end if;
  update public.requests set status = p_new_status, current_approval_level = level, is_locked = p_new_status in ('hod_approved','hod_rejected','finalized','rejected') where id = r.id;
  insert into public.request_history(request_id, actor_id, actor_role, action, previous_status, new_status, comments) values (r.id, auth.uid(), actor, 'transition', r.status, p_new_status, p_comments);
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference) values (auth.uid(), actor, 'approve', 'request', r.id::text);
end; $$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on function public.finalize_attendance_session(uuid) from public;
revoke all on function public.approve_attendance_correction(uuid, boolean, text) from public;
revoke all on function public.finalize_marks(uuid) from public;
revoke all on function public.approve_mark_correction(uuid, boolean, text) from public;
revoke all on function public.transition_request_status(uuid, public.request_status, text) from public;
grant execute on function public.finalize_attendance_session(uuid), public.approve_attendance_correction(uuid, boolean, text), public.finalize_marks(uuid), public.approve_mark_correction(uuid, boolean, text), public.transition_request_status(uuid, public.request_status, text) to authenticated;
