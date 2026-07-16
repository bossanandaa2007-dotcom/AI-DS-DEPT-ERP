do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'attendance_status'
  ) then
    create type public.attendance_status as enum ('pending_verification','present','late','absent');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'assessment_status'
  ) then
    create type public.assessment_status as enum ('draft','completed','finalized');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'assessment_type'
  ) then
    create type public.assessment_type as enum ('internal_test','assignment','quiz','practical','model_exam');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'correction_decision'
  ) then
    create type public.correction_decision as enum ('pending','approved','rejected');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'request_status'
  ) then
    create type public.request_status as enum ('draft','submitted','faculty_approved','faculty_rejected','hod_approved','hod_rejected','provisional_approved','certificate_pending','certificate_verified','finalized','expired');
  end if;
end
$$;

-- Keep this legacy schema compatible with any same-named enums already present.
alter type public.attendance_status add value if not exists 'pending_verification';
alter type public.attendance_status add value if not exists 'present';
alter type public.attendance_status add value if not exists 'late';
alter type public.attendance_status add value if not exists 'absent';
alter type public.assessment_status add value if not exists 'draft';
alter type public.assessment_status add value if not exists 'completed';
alter type public.assessment_status add value if not exists 'finalized';
alter type public.assessment_type add value if not exists 'internal_test';
alter type public.assessment_type add value if not exists 'assignment';
alter type public.assessment_type add value if not exists 'quiz';
alter type public.assessment_type add value if not exists 'practical';
alter type public.assessment_type add value if not exists 'model_exam';
alter type public.correction_decision add value if not exists 'pending';
alter type public.correction_decision add value if not exists 'approved';
alter type public.correction_decision add value if not exists 'rejected';
alter type public.request_status add value if not exists 'draft';
alter type public.request_status add value if not exists 'submitted';
alter type public.request_status add value if not exists 'faculty_approved';
alter type public.request_status add value if not exists 'faculty_rejected';
alter type public.request_status add value if not exists 'hod_approved';
alter type public.request_status add value if not exists 'hod_rejected';
alter type public.request_status add value if not exists 'provisional_approved';
alter type public.request_status add value if not exists 'certificate_pending';
alter type public.request_status add value if not exists 'certificate_verified';
alter type public.request_status add value if not exists 'finalized';
alter type public.request_status add value if not exists 'expired';
-- PostgreSQL requires newly added enum values to be committed before they are used.
commit;

create table if not exists public.student_daily_checkins (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(profile_id), section_id uuid not null references public.sections(id), checked_in_at timestamptz not null default now(), attendance_date date not null default current_date, status public.attendance_status not null default 'pending_verification', locked boolean not null default false, unique(student_id,attendance_date));
create table if not exists public.daily_attendance_sessions (id uuid primary key default gen_random_uuid(), section_id uuid not null references public.sections(id), attendance_date date not null, verifier_id uuid not null references public.faculty_profiles(profile_id), finalized_at timestamptz, locked boolean not null default false, unique(section_id,attendance_date));
create table if not exists public.subject_attendance_sessions (id uuid primary key default gen_random_uuid(), timetable_entry_id uuid not null references public.timetable_entries(id), faculty_id uuid not null references public.faculty_profiles(profile_id), subject_id uuid not null references public.subjects(id), section_id uuid not null references public.sections(id), attendance_date date not null, locked boolean not null default false, finalized_at timestamptz, unique(timetable_entry_id,attendance_date));
create table if not exists public.attendance_records (id uuid primary key default gen_random_uuid(), session_id uuid not null references public.subject_attendance_sessions(id) on delete cascade, student_id uuid not null references public.student_profiles(profile_id), status public.attendance_status not null check(status <> 'pending_verification'), original_status public.attendance_status not null check(original_status <> 'pending_verification'), locked boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(session_id,student_id));
create table if not exists public.staff_attendance (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id), attendance_date date not null, status public.attendance_status not null check(status <> 'pending_verification'), check_in_at timestamptz, unique(profile_id,attendance_date));
create table if not exists public.attendance_correction_requests (id uuid primary key default gen_random_uuid(), attendance_record_id uuid not null references public.attendance_records(id), student_id uuid not null references public.student_profiles(profile_id), original_status public.attendance_status not null, corrected_status public.attendance_status not null, reason text not null, decision public.correction_decision not null default 'pending', reviewer_id uuid references public.faculty_profiles(profile_id), reviewed_at timestamptz, created_at timestamptz not null default now());
create unique index if not exists attendance_pending_correction_idx on public.attendance_correction_requests(attendance_record_id) where decision = 'pending';
create table if not exists public.attendance_history (id uuid primary key default gen_random_uuid(), attendance_record_id uuid references public.attendance_records(id), actor_id uuid references public.profiles(id), action text not null, old_status public.attendance_status, new_status public.attendance_status, created_at timestamptz not null default now());

create table if not exists public.assessments (id uuid primary key default gen_random_uuid(), faculty_id uuid not null references public.faculty_profiles(profile_id), subject_id uuid not null references public.subjects(id), section_id uuid not null references public.sections(id), title text not null, assessment_type public.assessment_type not null, maximum_marks numeric(6,2) not null check(maximum_marks > 0), assessment_date date not null, status public.assessment_status not null default 'draft', finalized_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(subject_id,section_id,title,assessment_date));
create table if not exists public.student_marks (id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade, student_id uuid not null references public.student_profiles(profile_id), mark numeric(6,2), absent boolean not null default false, locked boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check ((absent and mark is null) or (not absent and mark is not null and mark >= 0)), unique(assessment_id,student_id));
create table if not exists public.mark_correction_requests (id uuid primary key default gen_random_uuid(), student_mark_id uuid not null references public.student_marks(id), student_id uuid not null references public.student_profiles(profile_id), old_mark numeric(6,2), corrected_mark numeric(6,2), reason text not null, decision public.correction_decision not null default 'pending', reviewer_id uuid references public.faculty_profiles(profile_id), reviewed_at timestamptz, created_at timestamptz not null default now());
create unique index if not exists mark_pending_correction_idx on public.mark_correction_requests(student_mark_id) where decision = 'pending';
create table if not exists public.mark_history (id uuid primary key default gen_random_uuid(), student_mark_id uuid not null references public.student_marks(id), actor_id uuid references public.profiles(id), action text not null, old_mark numeric(6,2), new_mark numeric(6,2), created_at timestamptz not null default now());

create table if not exists public.leave_requests (id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id), from_date date not null, to_date date not null, reason text not null, document_metadata jsonb, status public.request_status not null default 'submitted', locked boolean not null default false, created_at timestamptz not null default now(), check(to_date >= from_date));
create table if not exists public.gate_pass_requests (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(profile_id), pass_date date not null, exit_time time not null, expected_return_time time not null, reason text not null, emergency_details text, status public.request_status not null default 'submitted', locked boolean not null default false, created_at timestamptz not null default now(), check(expected_return_time > exit_time));
create table if not exists public.projects (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(profile_id), faculty_guide_id uuid references public.faculty_profiles(profile_id), name text not null, description text not null, status public.request_status not null default 'submitted', created_at timestamptz not null default now());
-- The clean schema has a same-named projects table without this legacy column.
alter table public.projects add column if not exists student_id uuid references public.student_profiles(profile_id);
create table if not exists public.project_members (project_id uuid not null references public.projects(id) on delete cascade, student_id uuid not null references public.student_profiles(profile_id), primary key(project_id,student_id));
create table if not exists public.competitions (id uuid primary key default gen_random_uuid(), name text not null, organizer text not null, venue text, event_date date not null, unique(name,organizer,event_date));
create table if not exists public.competition_registrations (id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.competitions(id), student_id uuid not null references public.student_profiles(profile_id), proof_metadata jsonb, status public.request_status not null default 'submitted', unique(competition_id,student_id));
create table if not exists public.od_requests (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(profile_id), project_id uuid references public.projects(id), competition_registration_id uuid references public.competition_registrations(id), proof_metadata jsonb, certificate_metadata jsonb, status public.request_status not null default 'submitted', locked boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.request_approvals (id uuid primary key default gen_random_uuid(), request_kind text not null check(request_kind in ('leave','gate_pass','od')), request_id uuid not null, stage text not null check(stage in ('class_teacher','faculty','hod','certificate')), reviewer_id uuid not null references public.profiles(id), decision public.request_status not null, note text, created_at timestamptz not null default now(), unique(request_kind,request_id,stage));
create table if not exists public.request_status_history (id uuid primary key default gen_random_uuid(), request_kind text not null, request_id uuid not null, status public.request_status not null, actor_id uuid references public.profiles(id), note text, created_at timestamptz not null default now());

create table if not exists public.portion_completion (id uuid primary key default gen_random_uuid(), timetable_entry_id uuid not null references public.timetable_entries(id), faculty_id uuid not null references public.faculty_profiles(profile_id), subject_id uuid not null references public.subjects(id), section_id uuid not null references public.sections(id), unit text not null, planned_topic text not null, completed_topic text not null, completion_percentage numeric(5,2) not null check(completion_percentage between 0 and 100), next_topic text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(timetable_entry_id));
create table if not exists public.announcements (id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id), title text not null, message text not null, category text not null, priority text not null check(priority in ('low','normal','high')), publish_date date not null default current_date, expiry_date date, attachment_metadata jsonb, created_at timestamptz not null default now());
create table if not exists public.announcement_recipients (announcement_id uuid not null references public.announcements(id) on delete cascade, profile_id uuid not null references public.profiles(id), read_at timestamptz, primary key(announcement_id,profile_id));
create table if not exists public.complaints (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(profile_id), category text not null, subject text not null, description text not null, attachment_metadata jsonb, status text not null default 'submitted' check(status in ('submitted','in_review','resolved')), assigned_to uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.complaint_history (id uuid primary key default gen_random_uuid(), complaint_id uuid not null references public.complaints(id) on delete cascade, actor_id uuid references public.profiles(id), status text not null, response text, created_at timestamptz not null default now());
create table if not exists public.communication_threads (id uuid primary key default gen_random_uuid(), subject text, created_at timestamptz not null default now());
create table if not exists public.communication_messages (id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.communication_threads(id) on delete cascade, sender_id uuid not null references public.profiles(id), recipient_id uuid not null references public.profiles(id), message text not null, read_at timestamptz, archived_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id), title text not null, body text not null, notification_type text not null check(notification_type in ('announcement','complaint','message')), created_at timestamptz not null default now());
create table if not exists public.notification_reads (notification_id uuid not null references public.notifications(id) on delete cascade, profile_id uuid not null references public.profiles(id), read_at timestamptz not null default now(), primary key(notification_id,profile_id));
create table if not exists public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), actor_role public.app_role, action text not null, module text not null, record_reference text not null, summary text not null, created_at timestamptz not null default now());
create table if not exists public.system_settings (key text primary key, value jsonb not null, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now());

drop trigger if exists attendance_records_updated_at on public.attendance_records;
create trigger attendance_records_updated_at before update on public.attendance_records for each row execute procedure public.set_updated_at();
drop trigger if exists assessments_updated_at on public.assessments;
create trigger assessments_updated_at before update on public.assessments for each row execute procedure public.set_updated_at();
drop trigger if exists marks_updated_at on public.student_marks;
create trigger marks_updated_at before update on public.student_marks for each row execute procedure public.set_updated_at();
drop trigger if exists portion_updated_at on public.portion_completion;
create trigger portion_updated_at before update on public.portion_completion for each row execute procedure public.set_updated_at();
drop trigger if exists complaints_updated_at on public.complaints;
create trigger complaints_updated_at before update on public.complaints for each row execute procedure public.set_updated_at();
drop trigger if exists system_settings_updated_at on public.system_settings;
create trigger system_settings_updated_at before update on public.system_settings for each row execute procedure public.set_updated_at();
create index if not exists subject_sessions_faculty_date_idx on public.subject_attendance_sessions(faculty_id,attendance_date);
create index if not exists attendance_records_student_idx on public.attendance_records(student_id);
create index if not exists assessments_section_subject_idx on public.assessments(section_id,subject_id);
create index if not exists marks_student_idx on public.student_marks(student_id);
create index if not exists request_status_idx on public.request_status_history(request_kind,request_id,status);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
