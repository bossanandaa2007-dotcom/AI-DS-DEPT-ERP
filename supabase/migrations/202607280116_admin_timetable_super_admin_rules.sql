-- Super Admin-only timetable maintenance and stricter timetable entry validation.

create or replace function public.assert_timetable_manager(p_department_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or actor.status <> 'active' then
    raise exception 'An active account is required.';
  end if;
  if actor.role = 'super_admin' then
    return actor;
  end if;
  raise exception 'Only Super Admin can manage timetable entries.';
end;
$$;

revoke all on function public.assert_timetable_manager(uuid) from public;

drop function if exists public.save_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, smallint, text, text, uuid, date, date);

create or replace function public.save_timetable_entry(
  p_entry_id uuid default null,
  p_section_id uuid default null,
  p_subject_id uuid default null,
  p_faculty_id uuid default null,
  p_allocation_id uuid default null,
  p_period_id uuid default null,
  p_day_of_week smallint default null,
  p_room text default null,
  p_lab text default null,
  p_lab_assistant_id uuid default null,
  p_effective_from date default null,
  p_effective_to date default null,
  p_is_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.profiles;
  selected_section public.sections;
  selected_subject public.subjects;
  selected_period public.timetable_periods;
  selected_allocation public.faculty_assignments;
  existing_entry public.timetable_entries;
  result_id uuid;
  cleaned_room text := nullif(btrim(coalesce(p_room, '')), '');
  cleaned_lab text := nullif(btrim(coalesce(p_lab, '')), '');
begin
  select * into selected_section from public.sections where id = p_section_id;
  if not found or not selected_section.is_active then
    raise exception 'Select an active Section.';
  end if;

  actor := public.assert_timetable_manager(selected_section.department_id);

  if p_day_of_week not between 1 and 7
    or not exists (
      select 1
      from public.timetable_working_days day
      where day.day_of_week = p_day_of_week
        and day.is_enabled
        and (day.department_id = selected_section.department_id or day.department_id is null)
    ) then
    raise exception 'The selected day is not enabled for this timetable.';
  end if;

  select * into selected_subject from public.subjects where id = p_subject_id;
  if not found
    or not selected_subject.is_active
    or selected_subject.department_id <> selected_section.department_id
    or selected_subject.semester_id <> selected_section.semester_id
    or selected_subject.study_year is distinct from selected_section.year_number then
    raise exception 'Select an active Subject for this Section, Semester, and Study Year.';
  end if;

  select * into selected_period from public.timetable_periods where id = p_period_id;
  if not found
    or not selected_period.is_active
    or selected_period.period_type <> 'teaching'
    or (selected_period.department_id is not null and selected_period.department_id <> selected_section.department_id) then
    raise exception 'Select an active teaching period for this department.';
  end if;

  if p_effective_from is null or (p_effective_to is not null and p_effective_from > p_effective_to) then
    raise exception 'The effective start date must not be after the end date.';
  end if;

  if selected_subject.subject_type = 'laboratory' then
    if cleaned_lab is null then
      raise exception 'Provide a Laboratory for laboratory Subjects.';
    end if;
  else
    if cleaned_room is null then
      raise exception 'Provide a Room for non-laboratory Subjects.';
    end if;
    if cleaned_lab is not null or p_lab_assistant_id is not null then
      raise exception 'Laboratory and Lab Assistant are allowed only for laboratory Subjects.';
    end if;
  end if;

  select * into selected_allocation from public.faculty_assignments where id = p_allocation_id;
  if not found
    or not selected_allocation.is_active
    or selected_allocation.faculty_id <> p_faculty_id
    or selected_allocation.section_id <> p_section_id
    or selected_allocation.subject_id <> p_subject_id
    or selected_allocation.assignment_type not in ('subject_faculty', 'lab_faculty')
    or selected_allocation.academic_year_id <> selected_section.academic_year_id
    or selected_allocation.semester_id <> selected_section.semester_id then
    raise exception 'The selected Faculty does not have a compatible active Subject allocation.';
  end if;

  if selected_allocation.assignment_type = 'lab_faculty' and selected_subject.subject_type <> 'laboratory' then
    raise exception 'Lab Faculty allocations are allowed only for laboratory Subjects.';
  end if;

  if not exists (
    select 1
    from public.profiles faculty
    where faculty.id = p_faculty_id
      and faculty.role = 'faculty'
      and faculty.status = 'active'
      and faculty.department_id = selected_section.department_id
  ) then
    raise exception 'Select an active Faculty member.';
  end if;

  if not (
    selected_allocation.effective_from <= p_effective_from
    and coalesce(selected_allocation.effective_to, 'infinity'::date) >= coalesce(p_effective_to, 'infinity'::date)
  ) then
    raise exception 'The Faculty allocation is not valid for the selected effective dates.';
  end if;

  if p_lab_assistant_id is not null and not exists (
    select 1
    from public.profiles assistant
    where assistant.id = p_lab_assistant_id
      and assistant.role = 'lab_assistant'
      and assistant.status = 'active'
      and assistant.department_id = selected_section.department_id
  ) then
    raise exception 'Select an active Lab Assistant from this department.';
  end if;

  if p_entry_id is not null then
    select * into existing_entry from public.timetable_entries where id = p_entry_id for update;
    if not found then
      raise exception 'Timetable entry was not found.';
    end if;
    perform public.assert_timetable_manager(existing_entry.department_id);
    if exists (
      select 1
      from public.attendance_sessions session
      where session.timetable_entry_id = p_entry_id
        and session.status in ('finalized', 'locked')
    ) then
      raise exception 'Finalized Attendance references this entry. Create a future replacement instead.';
    end if;
  end if;

  if coalesce(p_is_active, true) then
    if exists (
      select 1 from public.timetable_entries entry
      where entry.id is distinct from p_entry_id
        and entry.is_active
        and entry.day_of_week = p_day_of_week
        and entry.timetable_period_id = p_period_id
        and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date)
        and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date)
        and entry.section_id = p_section_id
    ) then raise exception 'This Section already has an entry during the selected period.'; end if;

    if exists (
      select 1 from public.timetable_entries entry
      where entry.id is distinct from p_entry_id
        and entry.is_active
        and entry.day_of_week = p_day_of_week
        and entry.timetable_period_id = p_period_id
        and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date)
        and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date)
        and entry.faculty_id = p_faculty_id
    ) then raise exception 'The selected Faculty is already assigned to another Section during this period.'; end if;

    if cleaned_room is not null and exists (
      select 1 from public.timetable_entries entry
      where entry.id is distinct from p_entry_id
        and entry.is_active
        and entry.day_of_week = p_day_of_week
        and entry.timetable_period_id = p_period_id
        and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date)
        and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date)
        and lower(btrim(entry.room)) = lower(cleaned_room)
    ) then raise exception 'The selected room is already in use during this period.'; end if;

    if cleaned_lab is not null and exists (
      select 1 from public.timetable_entries entry
      where entry.id is distinct from p_entry_id
        and entry.is_active
        and entry.day_of_week = p_day_of_week
        and entry.timetable_period_id = p_period_id
        and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date)
        and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date)
        and lower(btrim(entry.lab)) = lower(cleaned_lab)
    ) then raise exception 'The selected laboratory is already in use during this period.'; end if;

    if p_lab_assistant_id is not null and exists (
      select 1 from public.timetable_entries entry
      where entry.id is distinct from p_entry_id
        and entry.is_active
        and entry.day_of_week = p_day_of_week
        and entry.timetable_period_id = p_period_id
        and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date)
        and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date)
        and entry.lab_assistant_id = p_lab_assistant_id
    ) then raise exception 'The selected Lab Assistant is already assigned during this period.'; end if;
  end if;

  if p_entry_id is null then
    insert into public.timetable_entries (
      academic_year_id, department_id, semester_id, section_id, subject_id, faculty_id,
      lab_assistant_id, day_of_week, period, starts_at, ends_at, room, lab,
      timetable_period_id, allocation_id, effective_from, effective_to, is_active
    )
    values (
      selected_section.academic_year_id, selected_section.department_id, selected_section.semester_id,
      p_section_id, p_subject_id, p_faculty_id, p_lab_assistant_id, p_day_of_week,
      selected_period.period_number, selected_period.starts_at, selected_period.ends_at,
      coalesce(cleaned_room, cleaned_lab), cleaned_lab, p_period_id, p_allocation_id,
      p_effective_from, p_effective_to, coalesce(p_is_active, true)
    )
    returning id into result_id;
  else
    update public.timetable_entries
    set academic_year_id = selected_section.academic_year_id,
        department_id = selected_section.department_id,
        semester_id = selected_section.semester_id,
        section_id = p_section_id,
        subject_id = p_subject_id,
        faculty_id = p_faculty_id,
        lab_assistant_id = p_lab_assistant_id,
        day_of_week = p_day_of_week,
        period = selected_period.period_number,
        starts_at = selected_period.starts_at,
        ends_at = selected_period.ends_at,
        room = coalesce(cleaned_room, cleaned_lab),
        lab = cleaned_lab,
        timetable_period_id = p_period_id,
        allocation_id = p_allocation_id,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        is_active = coalesce(p_is_active, true)
    where id = p_entry_id
    returning id into result_id;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, module, record_reference, after_data)
  values (
    actor.id,
    actor.role,
    case when p_entry_id is null then 'timetable_entry_created' else 'timetable_entry_updated' end,
    'timetable',
    result_id::text,
    jsonb_build_object('section', selected_section.name, 'subject_code', selected_subject.code, 'faculty_id', p_faculty_id, 'day', p_day_of_week, 'period', selected_period.label, 'room_or_lab', coalesce(cleaned_lab, cleaned_room), 'is_active', coalesce(p_is_active, true))
  );

  return result_id;
end;
$$;

create or replace function public.deactivate_timetable_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.profiles;
  entry public.timetable_entries;
  subject_code text;
  section_name text;
begin
  select * into entry from public.timetable_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Timetable entry was not found.';
  end if;

  actor := public.assert_timetable_manager(entry.department_id);

  if exists (
    select 1
    from public.attendance_sessions session
    where session.timetable_entry_id = p_entry_id
      and session.status in ('finalized', 'locked')
  ) then
    raise exception 'Finalized Attendance references this entry. Create a future replacement instead.';
  end if;

  update public.timetable_entries
  set is_active = false,
      effective_to = least(coalesce(effective_to, current_date), greatest(effective_from, current_date))
  where id = p_entry_id;

  select code into subject_code from public.subjects where id = entry.subject_id;
  select name into section_name from public.sections where id = entry.section_id;

  insert into public.audit_logs (actor_id, actor_role, action, module, record_reference, after_data)
  values (actor.id, actor.role, 'timetable_entry_deactivated', 'timetable', p_entry_id::text, jsonb_build_object('section', section_name, 'subject_code', subject_code, 'faculty_id', entry.faculty_id, 'day', entry.day_of_week, 'period', entry.period, 'room_or_lab', coalesce(entry.lab, entry.room)));
end;
$$;

revoke all on function public.save_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, smallint, text, text, uuid, date, date, boolean) from public;
revoke all on function public.deactivate_timetable_entry(uuid) from public;
grant execute on function public.save_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, smallint, text, text, uuid, date, date, boolean) to authenticated;
grant execute on function public.deactivate_timetable_entry(uuid) to authenticated;
