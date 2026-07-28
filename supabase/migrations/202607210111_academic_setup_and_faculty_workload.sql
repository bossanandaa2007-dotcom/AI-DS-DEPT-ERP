-- Additive academic setup, allocation validation, and workload support.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'subject_type') then
    create type public.subject_type as enum ('theory', 'laboratory', 'theory_with_practical', 'elective', 'project');
  end if;
end
$$;

alter table public.semesters
  add column if not exists is_active boolean not null default true;

alter table public.sections
  add column if not exists batch text,
  add column if not exists is_active boolean not null default true;

alter table public.subjects
  add column if not exists subject_type public.subject_type not null default 'theory',
  add column if not exists weekly_hours smallint not null default 1 check (weekly_hours > 0),
  add column if not exists is_active boolean not null default true;

update public.subjects
set subject_type = case when is_lab then 'laboratory'::public.subject_type else 'theory'::public.subject_type end;

alter table public.faculty_assignments
  add column if not exists weekly_hours smallint not null default 0 check (weekly_hours >= 0),
  add column if not exists effective_from date,
  add column if not exists effective_to date;

update public.faculty_assignments assignment
set effective_from = academic_year.starts_on
from public.academic_years academic_year
where academic_year.id = assignment.academic_year_id
  and assignment.effective_from is null;

-- Preserve historical allocations while ensuring a single active primary subject
-- faculty assignment per academic context. The UUID breaks timestamp ties so this
-- remains deterministic and is safe to rerun.
with ranked_subject_faculty_assignments as (
  select
    id,
    row_number() over (
      partition by section_id, subject_id, academic_year_id, semester_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as recency_rank
  from public.faculty_assignments
  where is_active
    and assignment_type = 'subject_faculty'
)
update public.faculty_assignments assignment
set is_active = false
from ranked_subject_faculty_assignments ranked
where assignment.id = ranked.id
  and ranked.recency_rank > 1
  and assignment.is_active;

alter table public.faculty_assignments
  alter column effective_from set not null,
  drop constraint if exists faculty_assignments_effective_dates_check,
  drop constraint if exists faculty_assignments_subject_hours_check;

-- Historical assignments predate workload hours and may legitimately retain a zero value.
-- NOT VALID preserves those rows while enforcing the new rules on every new or updated row.
alter table public.faculty_assignments
  add constraint faculty_assignments_effective_dates_check
    check (effective_to is null or effective_to >= effective_from) not valid,
  add constraint faculty_assignments_subject_hours_check
    check (
      (assignment_type in ('subject_faculty', 'lab_faculty') and subject_id is not null and weekly_hours > 0)
      or (assignment_type in ('class_teacher', 'faculty_guide') and subject_id is null and weekly_hours = 0)
      or assignment_type not in ('subject_faculty', 'lab_faculty', 'class_teacher', 'faculty_guide')
    ) not valid;

create unique index if not exists sections_active_identity_key
  on public.sections (academic_year_id, semester_id, lower(btrim(name)), coalesce(lower(btrim(batch)), ''))
  where is_active;

create unique index if not exists subjects_code_ci_key
  on public.subjects (lower(btrim(code)));

create unique index if not exists faculty_assignments_one_primary_subject_faculty
  on public.faculty_assignments (section_id, subject_id, academic_year_id, semester_id)
  where is_active and assignment_type = 'subject_faculty';

create index if not exists faculty_assignments_workload_idx
  on public.faculty_assignments (faculty_id, academic_year_id, is_active, effective_from, effective_to);

create or replace function public.normalize_subject_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.is_lab := new.subject_type = 'laboratory';
  return new;
end;
$$;

drop trigger if exists subjects_normalize_type on public.subjects;
create trigger subjects_normalize_type
  before insert or update on public.subjects
  for each row execute procedure public.normalize_subject_type();

create or replace function public.validate_faculty_assignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  selected_faculty public.profiles;
  selected_section public.sections;
  selected_subject public.subjects;
  scheduled_hours integer;
begin
  if not new.is_active then return new; end if;

  select * into selected_faculty from public.profiles where id = new.faculty_id;
  if not found or selected_faculty.role <> 'faculty' or selected_faculty.status <> 'active' then
    raise exception 'Faculty assignment requires an active Faculty profile';
  end if;

  select * into selected_section from public.sections where id = new.section_id;
  if not found or not selected_section.is_active then raise exception 'Faculty assignment requires an active section'; end if;
  if selected_section.department_id <> selected_faculty.department_id
    or selected_section.academic_year_id <> new.academic_year_id
    or selected_section.semester_id <> new.semester_id then
    raise exception 'Faculty, section, academic year, and semester must belong to the same academic context';
  end if;

  if not exists (select 1 from public.academic_years where id = new.academic_year_id and is_active)
    or not exists (select 1 from public.semesters where id = new.semester_id and is_active) then
    raise exception 'Faculty assignment requires an active academic year and semester';
  end if;

  if new.assignment_type in ('subject_faculty', 'lab_faculty') then
    select * into selected_subject from public.subjects where id = new.subject_id;
    if not found or not selected_subject.is_active then raise exception 'Faculty assignment requires an active subject'; end if;
    if selected_subject.department_id <> selected_section.department_id or selected_subject.semester_id <> selected_section.semester_id then
      raise exception 'Subject and section must belong to the same department and semester';
    end if;

    select coalesce(sum(assignment.weekly_hours), 0) into scheduled_hours
    from public.faculty_assignments assignment
    where assignment.id <> new.id
      and assignment.is_active
      and assignment.section_id = new.section_id
      and assignment.subject_id = new.subject_id
      and daterange(assignment.effective_from, assignment.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]');
    if scheduled_hours + new.weekly_hours > selected_subject.weekly_hours then
      raise exception 'Allocated weekly hours exceed the subject weekly hours';
    end if;

    if exists (
      select 1 from public.faculty_assignments assignment
      where assignment.id <> new.id
        and assignment.is_active
        and assignment.section_id = new.section_id
        and assignment.subject_id = new.subject_id
        and assignment.assignment_type = new.assignment_type
        and daterange(assignment.effective_from, assignment.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')
    ) then
      raise exception 'An overlapping allocation already exists for this subject and section';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists faculty_assignments_validate_academic_context on public.faculty_assignments;
create trigger faculty_assignments_validate_academic_context
  before insert or update on public.faculty_assignments
  for each row execute procedure public.validate_faculty_assignment();
