-- Super Admin-only Subject Allocation and Faculty teaching-scope validation.

alter table public.subjects
  add column if not exists study_year smallint;

alter table public.subjects
  drop constraint if exists subjects_study_year_check,
  add constraint subjects_study_year_check
    check (study_year is null or study_year between 1 and 4) not valid;

-- Backfill a subject Study Year only when the existing semester-section mapping is
-- unambiguous. Ambiguous historical subjects are preserved and can be scoped later.
with semester_scope as (
  select
    section.semester_id,
    min(section.year_number) as study_year,
    count(distinct section.year_number) as study_year_count
  from public.sections section
  where section.is_active
  group by section.semester_id
)
update public.subjects subject
set study_year = semester_scope.study_year
from semester_scope
where subject.semester_id = semester_scope.semester_id
  and subject.study_year is null
  and semester_scope.study_year_count = 1;

create index if not exists subjects_active_context_idx
  on public.subjects (department_id, semester_id, study_year)
  where is_active;

create unique index if not exists subjects_active_code_context_key
  on public.subjects (department_id, semester_id, study_year, lower(btrim(code)))
  where is_active and study_year is not null;

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
    or not exists (select 1 from public.semesters where id = new.semester_id and academic_year_id = new.academic_year_id and is_active) then
    raise exception 'Faculty assignment requires an active academic year and semester';
  end if;

  if new.assignment_type in ('subject_faculty', 'lab_faculty') then
    select * into selected_subject from public.subjects where id = new.subject_id;
    if not found or not selected_subject.is_active then raise exception 'Faculty assignment requires an active subject'; end if;
    if selected_subject.department_id <> selected_section.department_id or selected_subject.semester_id <> selected_section.semester_id then
      raise exception 'Subject and section must belong to the same department and semester';
    end if;
    if selected_subject.study_year is null then
      raise exception 'Subject must be linked to a Study Year before allocation';
    end if;
    if selected_subject.study_year <> selected_section.year_number then
      raise exception 'Subject Study Year must match the selected Section Study Year';
    end if;
    if new.assignment_type = 'lab_faculty' and selected_subject.subject_type <> 'laboratory' then
      raise exception 'Lab Faculty allocation is allowed only for laboratory subjects';
    end if;

    if not exists (
      select 1
      from public.faculty_teaching_scopes scope
      where scope.faculty_id = new.faculty_id
        and scope.academic_year_id = new.academic_year_id
        and scope.study_year = selected_section.year_number
        and scope.section_id = new.section_id
        and scope.is_active
        and scope.effective_from <= new.effective_from
        and (scope.effective_to is null or (new.effective_to is not null and new.effective_to <= scope.effective_to))
    ) then
      raise exception 'Faculty must have an active teaching scope for this Academic Year, Study Year, and Section';
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

drop policy if exists faculty_assignments_admin on public.faculty_assignments;
create policy faculty_assignments_admin on public.faculty_assignments
  for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

revoke delete on public.faculty_assignments from authenticated;
