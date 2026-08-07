-- Floor duty is a recurring per-faculty roster (5 days x 3 shifts), but the schema had no table
-- for it, so it was loaded as a single department announcement listing all fifteen slots. That
-- forces every faculty member to read the whole roster to find their own two or three turns.
--
-- This gives it a table so each person can be shown only their own duty, and so the roster can
-- be edited without rewriting a block of prose.

create table if not exists public.floor_duties (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  shift text not null,
  starts_at time,
  ends_at time,
  display_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  -- One faculty member per shift per day, per year.
  unique (academic_year_id, day_of_week, shift)
);

create index if not exists floor_duties_faculty_idx on public.floor_duties(faculty_id) where is_active;
create index if not exists floor_duties_department_idx on public.floor_duties(department_id, day_of_week);

drop trigger if exists floor_duties_updated_at on public.floor_duties;
create trigger floor_duties_updated_at before update on public.floor_duties
  for each row execute procedure public.set_updated_at();

alter table public.floor_duties enable row level security;

-- The roster is not confidential within the department: staff need to know who is covering a
-- shift when they need to swap. Students have no reason to see it.
drop policy if exists floor_duties_select on public.floor_duties;
create policy floor_duties_select on public.floor_duties for select to authenticated
  using (
    public.current_department_id() = department_id
    and public.current_role() in ('super_admin', 'hod', 'faculty', 'lab_assistant')
  );

drop policy if exists floor_duties_manage on public.floor_duties;
create policy floor_duties_manage on public.floor_duties for all to authenticated
  using (public.can_manage_department(department_id))
  with check (public.can_manage_department(department_id));

grant select, insert, update, delete on public.floor_duties to authenticated;
revoke all on public.floor_duties from anon;
