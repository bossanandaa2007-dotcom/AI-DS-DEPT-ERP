-- Prompt 3: period-driven timetable workflow, effective dating, and conflict protection.

create table if not exists public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  period_number smallint,
  starts_at time not null,
  ends_at time not null,
  display_order smallint not null check (display_order > 0),
  period_type text not null check (period_type in ('teaching', 'break', 'lunch', 'non_teaching')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((period_type = 'teaching' and period_number is not null and period_number > 0) or (period_type <> 'teaching' and period_number is null))
);

create unique index if not exists timetable_periods_scope_order_key
  on public.timetable_periods (coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), display_order);
drop trigger if exists timetable_periods_updated_at on public.timetable_periods;
create trigger timetable_periods_updated_at before update on public.timetable_periods for each row execute procedure public.set_updated_at();

create table if not exists public.timetable_working_days (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  label text not null check (length(btrim(label)) > 0),
  display_order smallint not null check (display_order > 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists timetable_working_days_scope_day_key
  on public.timetable_working_days (coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), day_of_week);
drop trigger if exists timetable_working_days_updated_at on public.timetable_working_days;
create trigger timetable_working_days_updated_at before update on public.timetable_working_days for each row execute procedure public.set_updated_at();

insert into public.timetable_working_days (day_of_week, label, display_order, is_enabled)
select item.day_of_week, item.label, item.day_of_week, item.is_enabled
from (values (1::smallint, 'Monday'::text, true), (2::smallint, 'Tuesday'::text, true), (3::smallint, 'Wednesday'::text, true),
             (4::smallint, 'Thursday'::text, true), (5::smallint, 'Friday'::text, true), (6::smallint, 'Saturday'::text, true),
             (7::smallint, 'Sunday'::text, false)) as item(day_of_week, label, is_enabled)
where not exists (select 1 from public.timetable_working_days where department_id is null and day_of_week = item.day_of_week);

alter table public.timetable_entries
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict,
  add column if not exists department_id uuid references public.departments(id) on delete restrict,
  add column if not exists semester_id uuid references public.semesters(id) on delete restrict,
  add column if not exists timetable_period_id uuid references public.timetable_periods(id) on delete restrict,
  add column if not exists allocation_id uuid references public.faculty_assignments(id) on delete restrict,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists is_active boolean not null default true;

update public.timetable_entries entry
set academic_year_id = section.academic_year_id,
    department_id = section.department_id,
    semester_id = section.semester_id,
    effective_from = coalesce(entry.effective_from, academic_year.starts_on),
    effective_to = coalesce(entry.effective_to, academic_year.ends_on)
from public.sections section
join public.academic_years academic_year on academic_year.id = section.academic_year_id
where section.id = entry.section_id;

alter table public.timetable_entries
  alter column academic_year_id set not null,
  alter column department_id set not null,
  alter column semester_id set not null,
  alter column effective_from set not null;
alter table public.timetable_entries drop constraint if exists timetable_entries_effective_dates_check;
alter table public.timetable_entries drop constraint if exists timetable_entries_section_id_day_of_week_period_key;
alter table public.timetable_entries add constraint timetable_entries_effective_dates_check check (effective_to is null or effective_to >= effective_from);
create index if not exists timetable_entries_grid_idx on public.timetable_entries (section_id, day_of_week, timetable_period_id, is_active);
create index if not exists timetable_entries_conflict_idx on public.timetable_entries (day_of_week, timetable_period_id, is_active, effective_from, effective_to);

alter table public.timetable_periods enable row level security;
alter table public.timetable_working_days enable row level security;
drop policy if exists timetable_periods_admin on public.timetable_periods;
drop policy if exists timetable_periods_select on public.timetable_periods;
create policy timetable_periods_select on public.timetable_periods for select to authenticated using (is_active or public.current_role() = 'super_admin');
drop policy if exists timetable_working_days_select on public.timetable_working_days;
create policy timetable_working_days_select on public.timetable_working_days for select to authenticated using (is_enabled or public.current_role() = 'super_admin');

-- All timetable changes flow through SECURITY DEFINER RPCs. Read scope is intentionally role-specific.
revoke insert, update, delete on public.timetable_entries from authenticated;
drop policy if exists timetable_entries_select on public.timetable_entries;
create policy timetable_entries_select on public.timetable_entries for select to authenticated using (
  (public.current_role() = 'super_admin')
  or (public.current_role() = 'hod' and department_id = public.current_department_id())
  or (public.current_role() = 'faculty' and faculty_id = auth.uid())
  or (public.current_role() = 'lab_assistant' and lab_assistant_id = auth.uid())
  or (public.current_role() = 'student' and exists (
    select 1 from public.enrollments enrollment
    where enrollment.student_id = auth.uid() and enrollment.section_id = timetable_entries.section_id and enrollment.status = 'active'
  ))
);
drop policy if exists timetable_entries_admin on public.timetable_entries;

create or replace function public.assert_timetable_manager(p_department_id uuid)
returns public.profiles language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or actor.status <> 'active' then raise exception 'An active account is required.'; end if;
  if actor.role = 'super_admin' then return actor; end if;
  if actor.role = 'hod' and actor.department_id = p_department_id then return actor; end if;
  raise exception 'You are not authorized to manage this department timetable.';
end;
$$;
revoke all on function public.assert_timetable_manager(uuid) from public;

create or replace function public.save_timetable_entry(
  p_entry_id uuid default null, p_section_id uuid default null, p_subject_id uuid default null, p_faculty_id uuid default null,
  p_allocation_id uuid default null, p_period_id uuid default null, p_day_of_week smallint default null, p_room text default null,
  p_lab text default null, p_lab_assistant_id uuid default null, p_effective_from date default null, p_effective_to date default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles; selected_section public.sections; selected_subject public.subjects; selected_period public.timetable_periods;
  selected_allocation public.faculty_assignments; existing_entry public.timetable_entries; result_id uuid; cleaned_room text := nullif(btrim(coalesce(p_room, '')), ''); cleaned_lab text := nullif(btrim(coalesce(p_lab, '')), '');
begin
  select * into selected_section from public.sections where id = p_section_id;
  if not found or not selected_section.is_active then raise exception 'Select an active Section.'; end if;
  actor := public.assert_timetable_manager(selected_section.department_id);
  if p_day_of_week not between 1 and 7 or not exists (select 1 from public.timetable_working_days d where d.day_of_week = p_day_of_week and d.is_enabled and (d.department_id = selected_section.department_id or d.department_id is null)) then raise exception 'The selected day is not enabled for this timetable.'; end if;
  select * into selected_subject from public.subjects where id = p_subject_id;
  if not found or not selected_subject.is_active or selected_subject.department_id <> selected_section.department_id or selected_subject.semester_id <> selected_section.semester_id then raise exception 'Select an active Subject for this Section and Semester.'; end if;
  select * into selected_period from public.timetable_periods where id = p_period_id;
  if not found or not selected_period.is_active or selected_period.period_type <> 'teaching' or (selected_period.department_id is not null and selected_period.department_id <> selected_section.department_id) then raise exception 'Select an active teaching period for this department.'; end if;
  if cleaned_room is null and cleaned_lab is null then raise exception 'Provide a room or laboratory.'; end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_from > p_effective_to) then raise exception 'The effective start date must not be after the end date.'; end if;
  select * into selected_allocation from public.faculty_assignments where id = p_allocation_id;
  if not found or not selected_allocation.is_active or selected_allocation.faculty_id <> p_faculty_id or selected_allocation.section_id <> p_section_id or selected_allocation.subject_id <> p_subject_id or selected_allocation.assignment_type not in ('subject_faculty', 'lab_faculty') or selected_allocation.academic_year_id <> selected_section.academic_year_id or selected_allocation.semester_id <> selected_section.semester_id then raise exception 'The selected Faculty does not have a compatible active Subject allocation.'; end if;
  if not exists (select 1 from public.profiles faculty where faculty.id = p_faculty_id and faculty.role = 'faculty' and faculty.status = 'active') then raise exception 'Select an active Faculty member.'; end if;
  if not (selected_allocation.effective_from <= p_effective_from and coalesce(selected_allocation.effective_to, 'infinity'::date) >= coalesce(p_effective_to, 'infinity'::date)) then raise exception 'The Faculty allocation is not valid for the selected effective dates.'; end if;
  if p_lab_assistant_id is not null and not exists (select 1 from public.profiles assistant where assistant.id = p_lab_assistant_id and assistant.role = 'lab_assistant' and assistant.status = 'active' and assistant.department_id = selected_section.department_id) then raise exception 'Select an active Lab Assistant from this department.'; end if;
  if p_entry_id is not null then
    select * into existing_entry from public.timetable_entries where id = p_entry_id for update;
    if not found then raise exception 'Timetable entry was not found.'; end if;
    perform public.assert_timetable_manager(existing_entry.department_id);
    if exists (select 1 from public.attendance_sessions session where session.timetable_entry_id = p_entry_id) then raise exception 'Attendance references this entry. Create a future replacement instead.'; end if;
  end if;
  if exists (select 1 from public.timetable_entries entry where entry.id is distinct from p_entry_id and entry.is_active and entry.day_of_week = p_day_of_week and entry.timetable_period_id = p_period_id and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date) and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date) and entry.section_id = p_section_id) then raise exception 'This Section already has an entry during the selected period.'; end if;
  if exists (select 1 from public.timetable_entries entry where entry.id is distinct from p_entry_id and entry.is_active and entry.day_of_week = p_day_of_week and entry.timetable_period_id = p_period_id and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date) and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date) and entry.faculty_id = p_faculty_id) then raise exception 'The selected Faculty is already assigned to another Section during this period.'; end if;
  if cleaned_room is not null and exists (select 1 from public.timetable_entries entry where entry.id is distinct from p_entry_id and entry.is_active and entry.day_of_week = p_day_of_week and entry.timetable_period_id = p_period_id and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date) and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date) and entry.room = cleaned_room) then raise exception 'The selected room is already in use during this period.'; end if;
  if cleaned_lab is not null and exists (select 1 from public.timetable_entries entry where entry.id is distinct from p_entry_id and entry.is_active and entry.day_of_week = p_day_of_week and entry.timetable_period_id = p_period_id and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date) and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date) and entry.lab = cleaned_lab) then raise exception 'The selected laboratory is already in use during this period.'; end if;
  if p_lab_assistant_id is not null and exists (select 1 from public.timetable_entries entry where entry.id is distinct from p_entry_id and entry.is_active and entry.day_of_week = p_day_of_week and entry.timetable_period_id = p_period_id and entry.effective_from <= coalesce(p_effective_to, 'infinity'::date) and p_effective_from <= coalesce(entry.effective_to, 'infinity'::date) and entry.lab_assistant_id = p_lab_assistant_id) then raise exception 'The selected Lab Assistant is already assigned during this period.'; end if;
  if p_entry_id is null then
    insert into public.timetable_entries (academic_year_id, department_id, semester_id, section_id, subject_id, faculty_id, lab_assistant_id, day_of_week, period, starts_at, ends_at, room, lab, timetable_period_id, allocation_id, effective_from, effective_to, is_active)
    values (selected_section.academic_year_id, selected_section.department_id, selected_section.semester_id, p_section_id, p_subject_id, p_faculty_id, p_lab_assistant_id, p_day_of_week, selected_period.period_number, selected_period.starts_at, selected_period.ends_at, coalesce(cleaned_room, cleaned_lab), cleaned_lab, p_period_id, p_allocation_id, p_effective_from, p_effective_to, true) returning id into result_id;
  else
    update public.timetable_entries set academic_year_id = selected_section.academic_year_id, department_id = selected_section.department_id, semester_id = selected_section.semester_id, section_id = p_section_id, subject_id = p_subject_id, faculty_id = p_faculty_id, lab_assistant_id = p_lab_assistant_id, day_of_week = p_day_of_week, period = selected_period.period_number, starts_at = selected_period.starts_at, ends_at = selected_period.ends_at, room = coalesce(cleaned_room, cleaned_lab), lab = cleaned_lab, timetable_period_id = p_period_id, allocation_id = p_allocation_id, effective_from = p_effective_from, effective_to = p_effective_to where id = p_entry_id returning id into result_id;
  end if;
  insert into public.audit_logs (actor_id, actor_role, action, module, record_reference, after_data) values (actor.id, actor.role, case when p_entry_id is null then 'timetable_entry_created' else 'timetable_entry_updated' end, 'timetable', result_id::text, jsonb_build_object('section', selected_section.name, 'subject_code', selected_subject.code, 'faculty_id', p_faculty_id, 'day', p_day_of_week, 'period', selected_period.label, 'room_or_lab', coalesce(cleaned_lab, cleaned_room)));
  return result_id;
end;
$$;

create or replace function public.deactivate_timetable_entry(p_entry_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles; entry public.timetable_entries; subject_code text; section_name text;
begin
  select * into entry from public.timetable_entries where id = p_entry_id for update;
  if not found then raise exception 'Timetable entry was not found.'; end if;
  actor := public.assert_timetable_manager(entry.department_id);
  update public.timetable_entries set is_active = false, effective_to = least(coalesce(effective_to, current_date), greatest(effective_from, current_date)) where id = p_entry_id;
  select code into subject_code from public.subjects where id = entry.subject_id; select name into section_name from public.sections where id = entry.section_id;
  insert into public.audit_logs (actor_id, actor_role, action, module, record_reference, after_data) values (actor.id, actor.role, 'timetable_entry_deactivated', 'timetable', p_entry_id::text, jsonb_build_object('section', section_name, 'subject_code', subject_code, 'faculty_id', entry.faculty_id, 'day', entry.day_of_week, 'period', entry.period, 'room_or_lab', coalesce(entry.lab, entry.room)));
end;
$$;

create or replace function public.save_timetable_period(p_id uuid default null, p_department_id uuid default null, p_label text default null, p_period_number smallint default null, p_starts_at time default null, p_ends_at time default null, p_display_order smallint default null, p_period_type text default null, p_is_active boolean default true) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles; result_id uuid; item public.timetable_periods;
begin
  select * into actor from public.profiles where id = auth.uid(); if not found or actor.status <> 'active' or actor.role <> 'super_admin' then raise exception 'Only an active Super Admin may manage timetable periods.'; end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at or p_display_order is null or p_display_order < 1 or p_period_type not in ('teaching', 'break', 'lunch', 'non_teaching') or (p_period_type = 'teaching' and coalesce(p_period_number, 0) < 1) or (p_period_type <> 'teaching' and p_period_number is not null) then raise exception 'Provide a valid period label, times, display order, and slot type.'; end if;
  if p_id is null then insert into public.timetable_periods (department_id, label, period_number, starts_at, ends_at, display_order, period_type, is_active) values (p_department_id, btrim(p_label), p_period_number, p_starts_at, p_ends_at, p_display_order, p_period_type, coalesce(p_is_active, true)) returning id into result_id; else update public.timetable_periods set department_id = p_department_id, label = btrim(p_label), period_number = p_period_number, starts_at = p_starts_at, ends_at = p_ends_at, display_order = p_display_order, period_type = p_period_type, is_active = coalesce(p_is_active, true) where id = p_id returning id into result_id; end if;
  select * into item from public.timetable_periods where id = result_id; insert into public.audit_logs (actor_id, actor_role, action, module, record_reference, after_data) values (actor.id, actor.role, case when p_id is null then 'timetable_period_created' else 'timetable_period_updated' end, 'timetable', result_id::text, jsonb_build_object('label', item.label, 'period', item.period_number, 'slot_type', item.period_type)); return result_id;
end;
$$;

create or replace function public.save_timetable_working_day(p_id uuid, p_is_enabled boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor public.profiles;
begin select * into actor from public.profiles where id = auth.uid(); if not found or actor.status <> 'active' or actor.role <> 'super_admin' then raise exception 'Only an active Super Admin may manage working days.'; end if; update public.timetable_working_days set is_enabled = p_is_enabled where id = p_id; if not found then raise exception 'Working-day configuration was not found.'; end if; insert into public.audit_logs (actor_id, actor_role, action, module, record_reference, after_data) values (actor.id, actor.role, 'timetable_working_day_updated', 'timetable', p_id::text, jsonb_build_object('is_enabled', p_is_enabled)); end;
$$;

revoke all on function public.save_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, smallint, text, text, uuid, date, date) from public;
revoke all on function public.deactivate_timetable_entry(uuid) from public;
revoke all on function public.save_timetable_period(uuid, uuid, text, smallint, time, time, smallint, text, boolean) from public;
revoke all on function public.save_timetable_working_day(uuid, boolean) from public;
grant execute on function public.save_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, smallint, text, text, uuid, date, date) to authenticated;
grant execute on function public.deactivate_timetable_entry(uuid) to authenticated;
grant execute on function public.save_timetable_period(uuid, uuid, text, smallint, time, time, smallint, text, boolean) to authenticated;
grant execute on function public.save_timetable_working_day(uuid, boolean) to authenticated;
