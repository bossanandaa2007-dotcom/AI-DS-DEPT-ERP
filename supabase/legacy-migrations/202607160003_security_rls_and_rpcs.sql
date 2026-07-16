do $migration$
begin
  if to_regprocedure('public.current_role()') is null then
    execute $function$
create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public, pg_temp as $$ select role from public.profiles where id = auth.uid() $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.is_super_admin()') is null then
    execute $function$
create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select public.current_role() = 'super_admin' $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.is_hod()') is null then
    execute $function$
create or replace function public.is_hod() returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select public.current_role() = 'hod' $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.is_department_admin()') is null then
    execute $function$
create or replace function public.is_department_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select public.current_role() in ('super_admin','hod') $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.is_subject_faculty(uuid,uuid)') is null then
    execute $function$
create or replace function public.is_subject_faculty(p_subject uuid, p_section uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select exists(select 1 from public.faculty_subject_allocations where faculty_id=auth.uid() and subject_id=p_subject and section_id=p_section) $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.is_class_teacher(uuid)') is null then
    execute $function$
create or replace function public.is_class_teacher(p_section uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select exists(select 1 from public.class_teacher_allocations where faculty_id=auth.uid() and section_id=p_section) $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.is_enrolled_in(uuid)') is null then
    execute $function$
create or replace function public.is_enrolled_in(p_section uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select exists(select 1 from public.student_enrollments where student_id=auth.uid() and section_id=p_section and status='active') $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.can_view_student(uuid)') is null then
    execute $function$
create or replace function public.can_view_student(p_student uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select p_student=auth.uid() or public.is_department_admin() or exists(select 1 from public.student_enrollments e join public.class_teacher_allocations c on c.section_id=e.section_id where e.student_id=p_student and c.faculty_id=auth.uid()) $$;
$function$;
  end if;
end
$migration$;
revoke all on function public.current_role(), public.is_super_admin(), public.is_hod(), public.is_department_admin(), public.is_subject_faculty(uuid,uuid), public.is_class_teacher(uuid), public.is_enrolled_in(uuid), public.can_view_student(uuid) from public;
grant execute on function public.current_role(), public.is_super_admin(), public.is_hod(), public.is_department_admin(), public.is_subject_faculty(uuid,uuid), public.is_class_teacher(uuid), public.is_enrolled_in(uuid), public.can_view_student(uuid) to authenticated;

do $migration$
begin
  if to_regprocedure('public.validate_mark_limit()') is null then
    execute $function$
create or replace function public.validate_mark_limit() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ declare maximum numeric; begin select maximum_marks into maximum from public.assessments where id=new.assessment_id; if new.mark is not null and new.mark > maximum then raise exception 'mark exceeds assessment maximum'; end if; return new; end; $$;
$function$;
  end if;
end
$migration$;
drop trigger if exists validate_mark_limit on public.student_marks;
create trigger validate_mark_limit before insert or update on public.student_marks for each row execute procedure public.validate_mark_limit();
do $migration$
begin
  if to_regprocedure('public.prevent_locked_write()') is null then
    execute $function$
create or replace function public.prevent_locked_write() returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$ begin if old.locked and coalesce(current_setting('app.allow_locked_write', true),'off') <> 'on' then raise exception 'finalized record is locked'; end if; return new; end; $$;
$function$;
  end if;
end
$migration$;
drop trigger if exists prevent_locked_attendance on public.attendance_records;
create trigger prevent_locked_attendance before update or delete on public.attendance_records for each row execute procedure public.prevent_locked_write();
drop trigger if exists prevent_locked_marks on public.student_marks;
create trigger prevent_locked_marks before update or delete on public.student_marks for each row execute procedure public.prevent_locked_write();
do $migration$
begin
  if to_regprocedure('public.audit_append_only()') is null then
    execute $function$
create or replace function public.audit_append_only() returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$ begin raise exception 'audit logs are append-only'; end; $$;
$function$;
  end if;
end
$migration$;
drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute procedure public.audit_append_only();

do $migration$
begin
  if to_regprocedure('public.finalize_attendance(uuid)') is null then
    execute $function$
create or replace function public.finalize_attendance(p_session uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$ declare session_row public.subject_attendance_sessions; expected_count integer; actual_count integer; begin select * into session_row from public.subject_attendance_sessions where id=p_session for update; if not found or session_row.faculty_id <> auth.uid() then raise exception 'not assigned faculty'; end if; if session_row.locked then raise exception 'session already finalized'; end if; select count(*) into expected_count from public.student_enrollments where section_id=session_row.section_id and status='active'; select count(*) into actual_count from public.attendance_records where session_id=p_session; if expected_count <> actual_count then raise exception 'attendance is incomplete'; end if; update public.attendance_records set locked=true where session_id=p_session; update public.subject_attendance_sessions set locked=true, finalized_at=now() where id=p_session; insert into public.audit_logs(actor_id,actor_role,action,module,record_reference,summary) values(auth.uid(),public.current_role(),'finalize','attendance',p_session::text,'Finalized subject attendance'); end; $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.approve_attendance_correction(uuid,public.correction_decision)') is null then
    execute $function$
create or replace function public.approve_attendance_correction(p_request uuid, p_decision public.correction_decision) returns void language plpgsql security definer set search_path = public, pg_temp as $$ declare request_row public.attendance_correction_requests; begin select * into request_row from public.attendance_correction_requests where id=p_request for update; if not found or request_row.decision <> 'pending' then raise exception 'invalid correction request'; end if; if not exists(select 1 from public.attendance_records r join public.subject_attendance_sessions s on s.id=r.session_id where r.id=request_row.attendance_record_id and (s.faculty_id=auth.uid() or public.is_hod())) then raise exception 'not authorized'; end if; update public.attendance_correction_requests set decision=p_decision,reviewer_id=auth.uid(),reviewed_at=now() where id=p_request; if p_decision='approved' then perform set_config('app.allow_locked_write','on',true); update public.attendance_records set locked=false where id=request_row.attendance_record_id; update public.attendance_records set status=request_row.corrected_status,locked=true where id=request_row.attendance_record_id; end if; insert into public.attendance_history(attendance_record_id,actor_id,action,old_status,new_status) values(request_row.attendance_record_id,auth.uid(),p_decision,request_row.original_status,case when p_decision='approved' then request_row.corrected_status else request_row.original_status end); end; $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.finalize_assessment(uuid)') is null then
    execute $function$
create or replace function public.finalize_assessment(p_assessment uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$ declare assessment_row public.assessments; begin select * into assessment_row from public.assessments where id=p_assessment for update; if not found or assessment_row.faculty_id<>auth.uid() then raise exception 'not assigned faculty'; end if; if assessment_row.status='finalized' then raise exception 'assessment already finalized'; end if; if exists(select 1 from public.student_enrollments e where e.section_id=assessment_row.section_id and e.status='active' and not exists(select 1 from public.student_marks m where m.assessment_id=p_assessment and m.student_id=e.student_id)) then raise exception 'marks are incomplete'; end if; update public.student_marks set locked=true where assessment_id=p_assessment; update public.assessments set status='finalized',finalized_at=now() where id=p_assessment; insert into public.audit_logs(actor_id,actor_role,action,module,record_reference,summary) values(auth.uid(),public.current_role(),'finalize','marks',p_assessment::text,'Finalized assessment marks'); end; $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.approve_mark_correction(uuid,public.correction_decision)') is null then
    execute $function$
create or replace function public.approve_mark_correction(p_request uuid, p_decision public.correction_decision) returns void language plpgsql security definer set search_path = public, pg_temp as $$ declare request_row public.mark_correction_requests; begin select * into request_row from public.mark_correction_requests where id=p_request for update; if not found or request_row.decision<>'pending' then raise exception 'invalid correction request'; end if; if not exists(select 1 from public.student_marks m join public.assessments a on a.id=m.assessment_id where m.id=request_row.student_mark_id and a.faculty_id=auth.uid()) then raise exception 'not assigned faculty'; end if; update public.mark_correction_requests set decision=p_decision,reviewer_id=auth.uid(),reviewed_at=now() where id=p_request; if p_decision='approved' then perform set_config('app.allow_locked_write','on',true); update public.student_marks set locked=false where id=request_row.student_mark_id; update public.student_marks set mark=request_row.corrected_mark,absent=(request_row.corrected_mark is null),locked=true where id=request_row.student_mark_id; end if; insert into public.mark_history(student_mark_id,actor_id,action,old_mark,new_mark) values(request_row.student_mark_id,auth.uid(),p_decision,request_row.old_mark,case when p_decision='approved' then request_row.corrected_mark else request_row.old_mark end); end; $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.transition_request(text,uuid,public.request_status,text)') is null then
    execute $function$
create or replace function public.transition_request(p_kind text,p_request uuid,p_status public.request_status,p_note text default null) returns void language plpgsql security definer set search_path = public, pg_temp as $$ declare current_status public.request_status; allowed boolean:=false; begin if p_kind='leave' then select status into current_status from public.leave_requests where id=p_request for update; elsif p_kind='gate_pass' then select status into current_status from public.gate_pass_requests where id=p_request for update; elsif p_kind='od' then select status into current_status from public.od_requests where id=p_request for update; else raise exception 'invalid request type'; end if; allowed := (current_status='submitted' and p_status in ('faculty_approved','faculty_rejected') and (public.is_hod() or exists(select 1 from public.student_enrollments e join public.class_teacher_allocations c on c.section_id=e.section_id where c.faculty_id=auth.uid()))) or (current_status='faculty_approved' and p_status in ('hod_approved','hod_rejected','provisional_approved') and public.is_hod()) or (current_status='provisional_approved' and p_status='certificate_pending') or (current_status='certificate_pending' and p_status in ('certificate_verified','finalized') and public.current_role()='faculty'); if not allowed then raise exception 'invalid request transition'; end if; if p_kind='leave' then update public.leave_requests set status=p_status,locked=p_status in ('faculty_rejected','hod_approved','hod_rejected','finalized') where id=p_request; elsif p_kind='gate_pass' then update public.gate_pass_requests set status=p_status,locked=p_status in ('faculty_rejected','hod_approved','hod_rejected','finalized') where id=p_request; else update public.od_requests set status=p_status,locked=p_status='finalized' where id=p_request; end if; insert into public.request_status_history(request_kind,request_id,status,actor_id,note) values(p_kind,p_request,p_status,auth.uid(),p_note); end; $$;
$function$;
  end if;
end
$migration$;
revoke all on function public.finalize_attendance(uuid), public.approve_attendance_correction(uuid,public.correction_decision), public.finalize_assessment(uuid), public.approve_mark_correction(uuid,public.correction_decision), public.transition_request(text,uuid,public.request_status,text) from public;
grant execute on function public.finalize_attendance(uuid), public.approve_attendance_correction(uuid,public.correction_decision), public.finalize_assessment(uuid), public.approve_mark_correction(uuid,public.correction_decision), public.transition_request(text,uuid,public.request_status,text) to authenticated;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.faculty_profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.lab_assistant_profiles enable row level security;
alter table public.academic_years enable row level security;
alter table public.semesters enable row level security;
alter table public.years enable row level security;
alter table public.sections enable row level security;
alter table public.subjects enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.faculty_subject_allocations enable row level security;
alter table public.class_teacher_allocations enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.student_daily_checkins enable row level security;
alter table public.daily_attendance_sessions enable row level security;
alter table public.subject_attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.staff_attendance enable row level security;
alter table public.attendance_correction_requests enable row level security;
alter table public.attendance_history enable row level security;
alter table public.assessments enable row level security;
alter table public.student_marks enable row level security;
alter table public.mark_correction_requests enable row level security;
alter table public.mark_history enable row level security;
alter table public.leave_requests enable row level security;
alter table public.gate_pass_requests enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_registrations enable row level security;
alter table public.od_requests enable row level security;
alter table public.request_approvals enable row level security;
alter table public.request_status_history enable row level security;
alter table public.portion_completion enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_history enable row level security;
alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_department_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and role=public.current_role());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.department_id=departments.id));
drop policy if exists academic_read on public.academic_years;
create policy academic_read on public.academic_years for select to authenticated using (public.is_department_admin() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.department_id=academic_years.department_id));
drop policy if exists semesters_read on public.semesters;
create policy semesters_read on public.semesters for select to authenticated using (exists(select 1 from public.academic_years a where a.id=semesters.academic_year_id and (public.is_department_admin() or a.department_id=(select department_id from public.profiles where id=auth.uid()))));
drop policy if exists years_read on public.years;
create policy years_read on public.years for select to authenticated using (public.is_department_admin() or department_id=(select department_id from public.profiles where id=auth.uid()));
drop policy if exists sections_read on public.sections;
create policy sections_read on public.sections for select to authenticated using (public.is_department_admin() or public.is_enrolled_in(id) or public.is_class_teacher(id));
drop policy if exists subjects_read on public.subjects;
create policy subjects_read on public.subjects for select to authenticated using (public.is_department_admin() or department_id=(select department_id from public.profiles where id=auth.uid()));
drop policy if exists academic_admin_write on public.academic_years;
create policy academic_admin_write on public.academic_years for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists semesters_admin_write on public.semesters;
create policy semesters_admin_write on public.semesters for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists years_admin_write on public.years;
create policy years_admin_write on public.years for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists sections_admin_write on public.sections;
create policy sections_admin_write on public.sections for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists subjects_admin_write on public.subjects;
create policy subjects_admin_write on public.subjects for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists enrollment_read on public.student_enrollments;
create policy enrollment_read on public.student_enrollments for select to authenticated using (student_id=auth.uid() or public.is_class_teacher(section_id) or public.is_department_admin());
drop policy if exists allocation_read on public.faculty_subject_allocations;
create policy allocation_read on public.faculty_subject_allocations for select to authenticated using (faculty_id=auth.uid() or public.is_department_admin());
drop policy if exists allocation_admin_write on public.faculty_subject_allocations;
create policy allocation_admin_write on public.faculty_subject_allocations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists class_teacher_read on public.class_teacher_allocations;
create policy class_teacher_read on public.class_teacher_allocations for select to authenticated using (faculty_id=auth.uid() or public.is_department_admin());
drop policy if exists timetable_read on public.timetable_entries;
create policy timetable_read on public.timetable_entries for select to authenticated using (faculty_id=auth.uid() or lab_assistant_id=auth.uid() or public.is_enrolled_in(section_id) or public.is_department_admin());
drop policy if exists timetable_admin_write on public.timetable_entries;
create policy timetable_admin_write on public.timetable_entries for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists checkins_student on public.student_daily_checkins;
create policy checkins_student on public.student_daily_checkins for select to authenticated using (student_id=auth.uid() or public.is_class_teacher(section_id) or public.is_department_admin());
drop policy if exists checkins_insert_self on public.student_daily_checkins;
create policy checkins_insert_self on public.student_daily_checkins for insert to authenticated with check (student_id=auth.uid() and not locked);
drop policy if exists daily_sessions_read on public.daily_attendance_sessions;
create policy daily_sessions_read on public.daily_attendance_sessions for select to authenticated using (public.is_class_teacher(section_id) or public.is_department_admin());
drop policy if exists subject_sessions_read on public.subject_attendance_sessions;
create policy subject_sessions_read on public.subject_attendance_sessions for select to authenticated using (faculty_id=auth.uid() or public.is_enrolled_in(section_id) or public.is_department_admin());
drop policy if exists subject_sessions_faculty_insert on public.subject_attendance_sessions;
create policy subject_sessions_faculty_insert on public.subject_attendance_sessions for insert to authenticated with check (faculty_id=auth.uid() and public.is_subject_faculty(subject_id,section_id));
drop policy if exists records_read on public.attendance_records;
create policy records_read on public.attendance_records for select to authenticated using (student_id=auth.uid() or public.is_department_admin() or exists(select 1 from public.subject_attendance_sessions s where s.id=session_id and s.faculty_id=auth.uid()));
drop policy if exists records_faculty_write on public.attendance_records;
create policy records_faculty_write on public.attendance_records for insert to authenticated with check (exists(select 1 from public.subject_attendance_sessions s where s.id=session_id and s.faculty_id=auth.uid() and not s.locked));
drop policy if exists staff_read on public.staff_attendance;
create policy staff_read on public.staff_attendance for select to authenticated using (profile_id=auth.uid() or public.is_department_admin());
drop policy if exists attendance_correction_read on public.attendance_correction_requests;
create policy attendance_correction_read on public.attendance_correction_requests for select to authenticated using (student_id=auth.uid() or public.is_department_admin() or exists(select 1 from public.attendance_records r join public.subject_attendance_sessions s on s.id=r.session_id where r.id=attendance_record_id and s.faculty_id=auth.uid()));
drop policy if exists attendance_correction_insert on public.attendance_correction_requests;
create policy attendance_correction_insert on public.attendance_correction_requests for insert to authenticated with check (student_id=auth.uid() and exists(select 1 from public.attendance_records r join public.subject_attendance_sessions s on s.id=r.session_id where r.id=attendance_record_id and s.locked));
drop policy if exists attendance_history_read on public.attendance_history;
create policy attendance_history_read on public.attendance_history for select to authenticated using (public.is_department_admin() or exists(select 1 from public.attendance_records r where r.id=attendance_record_id and r.student_id=auth.uid()));

drop policy if exists assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated using (faculty_id=auth.uid() or public.is_enrolled_in(section_id) or public.is_class_teacher(section_id) or public.is_department_admin());
drop policy if exists assessments_faculty_insert on public.assessments;
create policy assessments_faculty_insert on public.assessments for insert to authenticated with check (faculty_id=auth.uid() and public.is_subject_faculty(subject_id,section_id));
drop policy if exists marks_read on public.student_marks;
create policy marks_read on public.student_marks for select to authenticated using (student_id=auth.uid() or public.is_department_admin() or exists(select 1 from public.assessments a where a.id=assessment_id and (a.faculty_id=auth.uid() or public.is_class_teacher(a.section_id))));
drop policy if exists marks_faculty_insert on public.student_marks;
create policy marks_faculty_insert on public.student_marks for insert to authenticated with check (exists(select 1 from public.assessments a where a.id=assessment_id and a.faculty_id=auth.uid() and a.status<>'finalized'));
drop policy if exists mark_correction_read on public.mark_correction_requests;
create policy mark_correction_read on public.mark_correction_requests for select to authenticated using (student_id=auth.uid() or exists(select 1 from public.student_marks m join public.assessments a on a.id=m.assessment_id where m.id=student_mark_id and (a.faculty_id=auth.uid() or public.is_hod())));
drop policy if exists mark_correction_insert on public.mark_correction_requests;
create policy mark_correction_insert on public.mark_correction_requests for insert to authenticated with check (student_id=auth.uid() and exists(select 1 from public.student_marks where id=student_mark_id and locked));
drop policy if exists mark_history_read on public.mark_history;
create policy mark_history_read on public.mark_history for select to authenticated using (public.is_department_admin() or exists(select 1 from public.student_marks where id=student_mark_id and student_id=auth.uid()));

drop policy if exists leave_own on public.leave_requests;
create policy leave_own on public.leave_requests for select to authenticated using (requester_id=auth.uid() or public.is_hod() or public.is_class_teacher((select e.section_id from public.student_enrollments e where e.student_id=leave_requests.requester_id and e.status='active' limit 1)));
drop policy if exists leave_insert_own on public.leave_requests;
create policy leave_insert_own on public.leave_requests for insert to authenticated with check (requester_id=auth.uid());
drop policy if exists gate_own on public.gate_pass_requests;
create policy gate_own on public.gate_pass_requests for select to authenticated using (student_id=auth.uid() or public.is_hod() or public.is_class_teacher((select e.section_id from public.student_enrollments e where e.student_id=gate_pass_requests.student_id and e.status='active' limit 1)));
drop policy if exists gate_insert_own on public.gate_pass_requests;
create policy gate_insert_own on public.gate_pass_requests for insert to authenticated with check (student_id=auth.uid());
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated using (student_id=auth.uid() or faculty_guide_id=auth.uid() or public.is_department_admin());
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects for insert to authenticated with check (student_id=auth.uid());
drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select to authenticated using (student_id=auth.uid() or exists(select 1 from public.projects p where p.id=project_id and (p.faculty_guide_id=auth.uid() or public.is_department_admin())));
drop policy if exists competitions_read on public.competitions;
create policy competitions_read on public.competitions for select to authenticated using (auth.uid() is not null);
drop policy if exists registrations_read on public.competition_registrations;
create policy registrations_read on public.competition_registrations for select to authenticated using (student_id=auth.uid() or public.is_department_admin());
drop policy if exists registrations_insert_own on public.competition_registrations;
create policy registrations_insert_own on public.competition_registrations for insert to authenticated with check (student_id=auth.uid());
drop policy if exists od_read on public.od_requests;
create policy od_read on public.od_requests for select to authenticated using (student_id=auth.uid() or public.is_department_admin() or exists(select 1 from public.projects p where p.id=project_id and p.faculty_guide_id=auth.uid()));
drop policy if exists od_insert_own on public.od_requests;
create policy od_insert_own on public.od_requests for insert to authenticated with check (student_id=auth.uid());
drop policy if exists request_history_read on public.request_status_history;
create policy request_history_read on public.request_status_history for select to authenticated using (public.is_department_admin() or actor_id=auth.uid());
drop policy if exists portion_read on public.portion_completion;
create policy portion_read on public.portion_completion for select to authenticated using (faculty_id=auth.uid() or public.is_department_admin() or public.is_enrolled_in(section_id));
drop policy if exists portion_insert_faculty on public.portion_completion;
create policy portion_insert_faculty on public.portion_completion for insert to authenticated with check (faculty_id=auth.uid() and public.is_subject_faculty(subject_id,section_id));
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated using (author_id=auth.uid() or exists(select 1 from public.announcement_recipients ar where ar.announcement_id=id and ar.profile_id=auth.uid()));
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for insert to authenticated with check (author_id=auth.uid() and public.current_role() in ('hod','faculty'));
drop policy if exists announcement_recipients_read on public.announcement_recipients;
create policy announcement_recipients_read on public.announcement_recipients for select to authenticated using (profile_id=auth.uid() or public.is_hod());
drop policy if exists complaints_read on public.complaints;
create policy complaints_read on public.complaints for select to authenticated using (student_id=auth.uid() or assigned_to=auth.uid() or public.is_hod());
drop policy if exists complaints_insert on public.complaints;
create policy complaints_insert on public.complaints for insert to authenticated with check (student_id=auth.uid());
drop policy if exists complaint_history_read on public.complaint_history;
create policy complaint_history_read on public.complaint_history for select to authenticated using (public.is_hod() or exists(select 1 from public.complaints c where c.id=complaint_id and (c.student_id=auth.uid() or c.assigned_to=auth.uid())));
drop policy if exists messages_read on public.communication_messages;
create policy messages_read on public.communication_messages for select to authenticated using (sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists messages_insert on public.communication_messages;
create policy messages_insert on public.communication_messages for insert to authenticated with check (sender_id=auth.uid());
drop policy if exists threads_read on public.communication_threads;
create policy threads_read on public.communication_threads for select to authenticated using (exists(select 1 from public.communication_messages m where m.thread_id=id and (m.sender_id=auth.uid() or m.recipient_id=auth.uid())));
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using (recipient_id=auth.uid());
drop policy if exists notification_reads_own on public.notification_reads;
create policy notification_reads_own on public.notification_reads for all to authenticated using (profile_id=auth.uid()) with check (profile_id=auth.uid());
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (public.is_super_admin() or public.is_hod());
drop policy if exists settings_admin on public.system_settings;
create policy settings_admin on public.system_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
