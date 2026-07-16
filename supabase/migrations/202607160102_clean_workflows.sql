-- Clean pilot baseline: attendance, marks, workflow, and operations (tables 10-29).
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'attendance_status'
  ) then
    create type public.attendance_status as enum ('present', 'late', 'absent');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'attendance_session_type'
  ) then
    create type public.attendance_session_type as enum ('daily', 'subject', 'lab');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'attendance_session_status'
  ) then
    create type public.attendance_session_status as enum ('draft', 'open', 'finalized', 'locked');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'correction_status'
  ) then
    create type public.correction_status as enum ('pending', 'approved', 'rejected');
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
    create type public.assessment_status as enum ('draft', 'completed', 'finalized');
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
    create type public.assessment_type as enum ('internal_test', 'assignment', 'quiz', 'practical', 'model_exam');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'request_type'
  ) then
    create type public.request_type as enum ('student_leave', 'staff_leave', 'gate_pass', 'od');
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
    create type public.request_status as enum ('draft', 'submitted', 'class_teacher_approved', 'faculty_approved', 'faculty_rejected', 'hod_approved', 'hod_rejected', 'provisional_approved', 'certificate_pending', 'certificate_verified', 'finalized', 'rejected', 'cancelled');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'attachment_entity'
  ) then
    create type public.attachment_entity as enum ('request', 'complaint', 'announcement');
  end if;
end
$$;

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  session_type public.attendance_session_type not null,
  timetable_entry_id uuid references public.timetable_entries(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete restrict,
  subject_id uuid references public.subjects(id) on delete restrict,
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  attendance_date date not null,
  period smallint check (period > 0),
  status public.attendance_session_status not null default 'draft',
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((session_type = 'daily' and timetable_entry_id is null and subject_id is null and period is null) or (session_type in ('subject', 'lab') and timetable_entry_id is not null and subject_id is not null and period is not null)),
  unique nulls not distinct (section_id, attendance_date, period, session_type)
);
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  status public.attendance_status not null,
  check_in_time timestamptz,
  verification_data jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  original_status public.attendance_status not null,
  requested_status public.attendance_status not null,
  reason text not null check (length(trim(reason)) > 2),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  reviewer_id uuid references public.profiles(id) on delete set null,
  status public.correction_status not null default 'pending',
  reviewer_comments text,
  reviewed_at timestamptz,
  history jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (requested_status <> original_status)
);
create unique index if not exists attendance_corrections_one_pending on public.attendance_corrections(attendance_record_id) where status = 'pending';
create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  attendance_date date not null,
  status public.attendance_status not null,
  check_in_time timestamptz,
  check_out_time timestamptz,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (profile_id, attendance_date)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete restrict,
  title text not null,
  assessment_type public.assessment_type not null,
  maximum_marks numeric(6,2) not null check (maximum_marks > 0),
  assessment_date date not null,
  status public.assessment_status not null default 'draft',
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (subject_id, section_id, title, assessment_date)
);
create table if not exists public.marks (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  obtained_marks numeric(6,2),
  absent boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((absent and obtained_marks is null) or (not absent and obtained_marks is not null and obtained_marks >= 0)),
  unique (assessment_id, student_id)
);
create or replace function public.validate_mark_maximum() returns trigger language plpgsql set search_path = public, pg_temp as $$
declare max_marks numeric;
begin
  select maximum_marks into max_marks from public.assessments where id = new.assessment_id;
  if not new.absent and new.obtained_marks > max_marks then raise exception 'obtained_marks cannot exceed maximum_marks'; end if;
  return new;
end; $$;
drop trigger if exists marks_validate_maximum on public.marks;
create trigger marks_validate_maximum before insert or update on public.marks for each row execute procedure public.validate_mark_maximum();
create table if not exists public.mark_corrections (
  id uuid primary key default gen_random_uuid(),
  mark_id uuid not null references public.marks(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  original_marks numeric(6,2),
  requested_marks numeric(6,2),
  reason text not null check (length(trim(reason)) > 2),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  reviewer_id uuid references public.profiles(id) on delete set null,
  status public.correction_status not null default 'pending',
  reviewer_comments text,
  reviewed_at timestamptz,
  history jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists mark_corrections_one_pending on public.mark_corrections(mark_id) where status = 'pending';

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  request_type public.request_type not null,
  status public.request_status not null default 'draft',
  reason text not null check (length(trim(reason)) > 2),
  from_date date,
  to_date date,
  details jsonb not null default '{}',
  current_approval_level smallint not null default 0 check (current_approval_level between 0 and 4),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (to_date is null or from_date is null or to_date >= from_date)
);
create table if not exists public.request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  action text not null,
  previous_status public.request_status,
  new_status public.request_status,
  comments text,
  created_at timestamptz not null default now()
);
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  faculty_guide_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text not null,
  status text not null default 'active' check (status in ('proposed', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (project_id, student_id)
);
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  name text not null,
  organizer text not null,
  venue text,
  event_date date not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (name, organizer, event_date)
);
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  entity_type public.attachment_entity not null,
  entity_id uuid not null,
  bucket_id text not null check (bucket_id in ('leave-documents', 'gate-pass-documents', 'od-proofs', 'od-certificates', 'complaint-attachments', 'announcement-attachments')),
  object_path text not null,
  filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 3145728),
  created_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create table if not exists public.portion_updates (
  id uuid primary key default gen_random_uuid(),
  timetable_entry_id uuid not null references public.timetable_entries(id) on delete restrict,
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete restrict,
  unit text not null, planned_topic text not null, completed_topic text not null,
  completion_percentage numeric(5,2) not null check (completion_percentage between 0 and 100),
  next_topic text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  title text not null, message text not null, category text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  audience text not null default 'department' check (audience in ('department', 'faculty', 'students', 'lab_assistants', 'year', 'section', 'assigned_students')),
  target jsonb not null default '{}', publish_date date not null default current_date, expiry_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (expiry_date is null or expiry_date >= publish_date)
);
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(), primary key (announcement_id, profile_id)
);
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  category text not null, subject text not null, description text not null,
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'resolved')),
  assigned_to uuid references public.profiles(id) on delete set null,
  response text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  message text not null check (length(trim(message)) > 0),
  read_at timestamptz, archived_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, body text not null,
  notification_type text not null check (notification_type in ('announcement', 'complaint', 'message', 'workflow')),
  read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role, action text not null, module text not null,
  record_reference text not null, before_data jsonb, after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attendance_sessions_section_date_idx on public.attendance_sessions(section_id, attendance_date);
create index if not exists attendance_records_student_idx on public.attendance_records(student_id);
create index if not exists assessments_section_idx on public.assessments(section_id, assessment_date);
create index if not exists marks_student_idx on public.marks(student_id);
create index if not exists requests_requester_status_idx on public.requests(requester_id, status);
create index if not exists request_history_request_idx on public.request_history(request_id, created_at);
create index if not exists attachments_owner_entity_idx on public.attachments(owner_id, entity_type, entity_id);
create index if not exists announcements_department_date_idx on public.announcements(department_id, publish_date);
create index if not exists messages_recipient_idx on public.messages(recipient_id, created_at desc);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);

drop trigger if exists attendance_sessions_updated_at on public.attendance_sessions;
create trigger attendance_sessions_updated_at before update on public.attendance_sessions for each row execute procedure public.set_updated_at();
drop trigger if exists attendance_records_updated_at on public.attendance_records;
create trigger attendance_records_updated_at before update on public.attendance_records for each row execute procedure public.set_updated_at();
drop trigger if exists attendance_corrections_updated_at on public.attendance_corrections;
create trigger attendance_corrections_updated_at before update on public.attendance_corrections for each row execute procedure public.set_updated_at();
drop trigger if exists staff_attendance_updated_at on public.staff_attendance;
create trigger staff_attendance_updated_at before update on public.staff_attendance for each row execute procedure public.set_updated_at();
drop trigger if exists assessments_updated_at on public.assessments;
create trigger assessments_updated_at before update on public.assessments for each row execute procedure public.set_updated_at();
drop trigger if exists marks_updated_at on public.marks;
create trigger marks_updated_at before update on public.marks for each row execute procedure public.set_updated_at();
drop trigger if exists mark_corrections_updated_at on public.mark_corrections;
create trigger mark_corrections_updated_at before update on public.mark_corrections for each row execute procedure public.set_updated_at();
drop trigger if exists requests_updated_at on public.requests;
create trigger requests_updated_at before update on public.requests for each row execute procedure public.set_updated_at();
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects for each row execute procedure public.set_updated_at();
drop trigger if exists competitions_updated_at on public.competitions;
create trigger competitions_updated_at before update on public.competitions for each row execute procedure public.set_updated_at();
drop trigger if exists portion_updates_updated_at on public.portion_updates;
create trigger portion_updates_updated_at before update on public.portion_updates for each row execute procedure public.set_updated_at();
drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at before update on public.announcements for each row execute procedure public.set_updated_at();
drop trigger if exists complaints_updated_at on public.complaints;
create trigger complaints_updated_at before update on public.complaints for each row execute procedure public.set_updated_at();
