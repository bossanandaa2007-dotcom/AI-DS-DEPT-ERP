create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'app_role'
  ) then
    create type public.app_role as enum ('super_admin','hod','faculty','lab_assistant','student');
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
    create type public.user_status as enum ('active','inactive','suspended');
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
    create type public.faculty_responsibility as enum ('subject_faculty','class_teacher','faculty_guide','general_faculty');
  end if;
end
$$;

-- Keep this legacy schema compatible with any same-named enums already present.
alter type public.app_role add value if not exists 'super_admin';
alter type public.app_role add value if not exists 'hod';
alter type public.app_role add value if not exists 'faculty';
alter type public.app_role add value if not exists 'lab_assistant';
alter type public.app_role add value if not exists 'student';
alter type public.user_status add value if not exists 'active';
alter type public.user_status add value if not exists 'inactive';
alter type public.user_status add value if not exists 'suspended';
alter type public.faculty_responsibility add value if not exists 'subject_faculty';
alter type public.faculty_responsibility add value if not exists 'class_teacher';
alter type public.faculty_responsibility add value if not exists 'faculty_guide';
alter type public.faculty_responsibility add value if not exists 'general_faculty';
-- PostgreSQL requires newly added enum values to be committed before they are used.
commit;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, department_id uuid references public.departments(id),
  full_name text not null, email text not null unique, role public.app_role not null default 'student', status public.user_status not null default 'inactive',
  avatar_url text, faculty_responsibilities public.faculty_responsibility[] not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.faculty_profiles (profile_id uuid primary key references public.profiles(id) on delete cascade, employee_number text not null unique, designation text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.student_profiles (profile_id uuid primary key references public.profiles(id) on delete cascade, register_number text not null unique, admission_year integer not null check (admission_year between 2000 and 2100), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.lab_assistant_profiles (profile_id uuid primary key references public.profiles(id) on delete cascade, employee_number text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.academic_years (id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id), name text not null, starts_on date not null, ends_on date not null, is_active boolean not null default false, check (ends_on > starts_on), unique (department_id,name));
create table if not exists public.semesters (id uuid primary key default gen_random_uuid(), academic_year_id uuid not null references public.academic_years(id) on delete cascade, number smallint not null check (number between 1 and 10), name text not null, starts_on date, ends_on date, unique (academic_year_id,number));
create table if not exists public.years (id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id), number smallint not null check (number between 1 and 6), name text not null, unique (department_id,number));
create table if not exists public.sections (id uuid primary key default gen_random_uuid(), year_id uuid not null references public.years(id), semester_id uuid not null references public.semesters(id), name text not null, capacity integer check (capacity > 0), unique (year_id,semester_id,name));
create table if not exists public.subjects (id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id), semester_id uuid not null references public.semesters(id), code text not null, name text not null, credits numeric(3,1) check (credits >= 0), is_lab boolean not null default false, unique (department_id,code));
create table if not exists public.student_enrollments (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.student_profiles(profile_id), section_id uuid not null references public.sections(id), academic_year_id uuid not null references public.academic_years(id), status text not null default 'active' check (status in ('active','inactive','completed')), unique(student_id,academic_year_id));
create table if not exists public.faculty_subject_allocations (id uuid primary key default gen_random_uuid(), faculty_id uuid not null references public.faculty_profiles(profile_id), subject_id uuid not null references public.subjects(id), section_id uuid not null references public.sections(id), responsibility public.faculty_responsibility not null default 'subject_faculty', created_at timestamptz not null default now(), unique(faculty_id,subject_id,section_id,responsibility));
create table if not exists public.class_teacher_allocations (id uuid primary key default gen_random_uuid(), faculty_id uuid not null references public.faculty_profiles(profile_id), section_id uuid not null references public.sections(id), academic_year_id uuid not null references public.academic_years(id), created_at timestamptz not null default now(), unique(section_id,academic_year_id));
create table if not exists public.timetable_entries (id uuid primary key default gen_random_uuid(), section_id uuid not null references public.sections(id), subject_id uuid not null references public.subjects(id), faculty_id uuid references public.faculty_profiles(profile_id), lab_assistant_id uuid references public.lab_assistant_profiles(profile_id), day_of_week smallint not null check (day_of_week between 1 and 7), period smallint not null check (period > 0), starts_at time not null, ends_at time not null, room text not null, lab text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (ends_at > starts_at), unique(section_id,day_of_week,period));

do $migration$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    execute $function$
create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$ begin new.updated_at = now(); return new; end; $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.handle_new_user()') is null then
    execute $function$
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ begin insert into public.profiles (id,full_name,email,role,status) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1)), new.email, 'student', 'inactive'); return new; end; $$;
$function$;
  end if;
end
$migration$;
revoke all on function public.handle_new_user() from public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at before update on public.departments for each row execute procedure public.set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists faculty_profiles_updated_at on public.faculty_profiles;
create trigger faculty_profiles_updated_at before update on public.faculty_profiles for each row execute procedure public.set_updated_at();
drop trigger if exists student_profiles_updated_at on public.student_profiles;
create trigger student_profiles_updated_at before update on public.student_profiles for each row execute procedure public.set_updated_at();
drop trigger if exists lab_profiles_updated_at on public.lab_assistant_profiles;
create trigger lab_profiles_updated_at before update on public.lab_assistant_profiles for each row execute procedure public.set_updated_at();
drop trigger if exists timetable_updated_at on public.timetable_entries;
create trigger timetable_updated_at before update on public.timetable_entries for each row execute procedure public.set_updated_at();
create index if not exists profiles_department_role_idx on public.profiles(department_id,role,status);
create index if not exists enrollments_section_idx on public.student_enrollments(section_id,academic_year_id);
create index if not exists allocations_faculty_idx on public.faculty_subject_allocations(faculty_id,section_id);
create index if not exists timetable_faculty_idx on public.timetable_entries(faculty_id,day_of_week);
