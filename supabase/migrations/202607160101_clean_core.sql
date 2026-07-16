-- Clean pilot baseline: identity and academic setup (tables 1-9).
create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'app_role'
  ) then
    create type public.app_role as enum ('super_admin', 'hod', 'faculty', 'lab_assistant', 'student');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'user_status'
  ) then
    create type public.user_status as enum ('active', 'inactive', 'suspended');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'faculty_responsibility'
  ) then
    create type public.faculty_responsibility as enum ('subject_faculty', 'class_teacher', 'faculty_guide', 'lab_faculty');
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'assignment_type'
  ) then
    create type public.assignment_type as enum ('subject_faculty', 'class_teacher', 'faculty_guide', 'lab_faculty');
  end if;
end
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$ begin new.updated_at = now(); return new; end; $$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9&-]{2,20}$'),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (department_id, name)
);
create unique index if not exists academic_years_one_active_per_department on public.academic_years(department_id) where is_active;

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  number smallint not null check (number between 1 and 10),
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on > starts_on),
  unique (academic_year_id, number)
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  year_number smallint not null check (year_number between 1 and 6),
  name text not null,
  capacity integer check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, semester_id, year_number, name)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  code text not null,
  name text not null,
  credits numeric(3,1) not null default 0 check (credits >= 0),
  is_lab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, semester_id, code)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  department_id uuid references public.departments(id) on delete restrict,
  section_id uuid references public.sections(id) on delete set null,
  role public.app_role not null default 'student',
  full_name text not null check (length(trim(full_name)) >= 2),
  email text not null unique,
  employee_or_register_number text unique,
  phone text,
  designation text,
  faculty_responsibilities public.faculty_responsibility[] not null default '{}',
  status public.user_status not null default 'inactive',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'student' and cardinality(faculty_responsibilities) = 0) or role <> 'student')
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create table if not exists public.faculty_assignments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  subject_id uuid references public.subjects(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  assignment_type public.assignment_type not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((assignment_type in ('subject_faculty', 'lab_faculty') and subject_id is not null) or (assignment_type in ('class_teacher', 'faculty_guide')))
);
create unique index if not exists faculty_assignments_unique_active on public.faculty_assignments(faculty_id, subject_id, section_id, academic_year_id, semester_id, assignment_type) nulls not distinct where is_active;
create unique index if not exists one_active_class_teacher on public.faculty_assignments(section_id, academic_year_id) where is_active and assignment_type = 'class_teacher';

create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  faculty_id uuid references public.profiles(id) on delete set null,
  lab_assistant_id uuid references public.profiles(id) on delete set null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  period smallint not null check (period > 0),
  starts_at time not null,
  ends_at time not null,
  room text not null,
  lab text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (section_id, day_of_week, period)
);

create index if not exists profiles_department_role_idx on public.profiles(department_id, role, status);
create index if not exists enrollments_section_year_idx on public.enrollments(section_id, academic_year_id);
create index if not exists faculty_assignments_faculty_idx on public.faculty_assignments(faculty_id, section_id) where is_active;
create index if not exists timetable_faculty_idx on public.timetable_entries(faculty_id, day_of_week);

drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at before update on public.departments for each row execute procedure public.set_updated_at();
drop trigger if exists academic_years_updated_at on public.academic_years;
create trigger academic_years_updated_at before update on public.academic_years for each row execute procedure public.set_updated_at();
drop trigger if exists semesters_updated_at on public.semesters;
create trigger semesters_updated_at before update on public.semesters for each row execute procedure public.set_updated_at();
drop trigger if exists sections_updated_at on public.sections;
create trigger sections_updated_at before update on public.sections for each row execute procedure public.set_updated_at();
drop trigger if exists subjects_updated_at on public.subjects;
create trigger subjects_updated_at before update on public.subjects for each row execute procedure public.set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists enrollments_updated_at on public.enrollments;
create trigger enrollments_updated_at before update on public.enrollments for each row execute procedure public.set_updated_at();
drop trigger if exists faculty_assignments_updated_at on public.faculty_assignments;
create trigger faculty_assignments_updated_at before update on public.faculty_assignments for each row execute procedure public.set_updated_at();
drop trigger if exists timetable_entries_updated_at on public.timetable_entries;
create trigger timetable_entries_updated_at before update on public.timetable_entries for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.email, 'student', 'inactive');
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
