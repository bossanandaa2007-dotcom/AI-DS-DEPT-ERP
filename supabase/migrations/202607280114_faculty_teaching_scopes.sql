-- Add Faculty employment details and reusable, subject-independent teaching scopes.

alter table public.profiles
  add column if not exists employment_type text,
  add column if not exists joining_date date;

alter table public.profiles
  drop constraint if exists profiles_joining_date_check,
  add constraint profiles_joining_date_check
    check (joining_date is null or joining_date <= current_date) not valid;

create table if not exists public.faculty_teaching_scopes (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  study_year smallint not null check (study_year between 1 and 4),
  section_id uuid not null references public.sections(id) on delete restrict,
  is_active boolean not null default true,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists faculty_teaching_scopes_one_active_scope_key
  on public.faculty_teaching_scopes (faculty_id, academic_year_id, study_year, section_id)
  where is_active;

create index if not exists faculty_teaching_scopes_faculty_active_idx
  on public.faculty_teaching_scopes (faculty_id, is_active, effective_from, effective_to);

create or replace function public.validate_faculty_teaching_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  selected_faculty public.profiles;
  selected_section public.sections;
begin
  if not new.is_active then return new; end if;

  select * into selected_faculty from public.profiles where id = new.faculty_id;
  if not found or selected_faculty.role <> 'faculty' or selected_faculty.status <> 'active' then
    raise exception 'An active Faculty profile is required for an active teaching scope';
  end if;

  select * into selected_section from public.sections where id = new.section_id;
  if not found
    or not selected_section.is_active
    or selected_section.department_id <> selected_faculty.department_id
    or selected_section.academic_year_id <> new.academic_year_id
    or selected_section.year_number <> new.study_year then
    raise exception 'Teaching scope Academic Year, Study Year, and Section must match the active Faculty department';
  end if;

  return new;
end;
$$;

drop trigger if exists faculty_teaching_scopes_validate on public.faculty_teaching_scopes;
create trigger faculty_teaching_scopes_validate
  before insert or update on public.faculty_teaching_scopes
  for each row execute procedure public.validate_faculty_teaching_scope();

drop trigger if exists faculty_teaching_scopes_updated_at on public.faculty_teaching_scopes;
create trigger faculty_teaching_scopes_updated_at
  before update on public.faculty_teaching_scopes
  for each row execute procedure public.set_updated_at();

alter table public.faculty_teaching_scopes enable row level security;
drop policy if exists faculty_teaching_scopes_select on public.faculty_teaching_scopes;
create policy faculty_teaching_scopes_select on public.faculty_teaching_scopes
  for select to authenticated
  using (faculty_id = auth.uid() or public.can_manage_department((select department_id from public.sections where id = section_id)));
drop policy if exists faculty_teaching_scopes_admin on public.faculty_teaching_scopes;
create policy faculty_teaching_scopes_admin on public.faculty_teaching_scopes
  for all to authenticated
  using (public.can_manage_department((select department_id from public.sections where id = section_id)))
  with check (public.can_manage_department((select department_id from public.sections where id = section_id)));

revoke delete on public.faculty_teaching_scopes from authenticated;
