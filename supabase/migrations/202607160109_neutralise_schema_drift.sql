-- The deployed database carries an unmigrated timetable/allocation feature that no committed
-- migration creates: a `faculty_teaching_scopes` table, a `timetable_periods` table, and extra
-- columns on faculty_assignments, timetable_entries, subjects, sections and profiles.
--
-- Its enforcement blocks the committed application:
--   * a trigger on faculty_assignments raises
--     'Faculty must have an active teaching scope for this Academic Year, Study Year, and Section'
--     while public.faculty_teaching_scopes holds zero rows, so no subject allocation can be created;
--   * effective_from is NOT NULL with no default on faculty_assignments and timetable_entries,
--     so inserts fail with 23502.
--
-- This migration removes the blocking behaviour without dropping the drifted tables or columns,
-- so that work can still be adopted later. Every statement is guarded so the migration is a no-op
-- on a clean database built from the committed migrations alone.

-- 1. Drop the teaching-scope gate. Only triggers whose function actually raises that exception
--    are removed, matched on the message text rather than a guessed trigger name.
do $$
declare blocked record;
begin
  for blocked in
    select tg.tgname, c.relname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid and c.relnamespace = 'public'::regnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where c.relname in ('faculty_assignments', 'timetable_entries')
      and not tg.tgisinternal
      and pg_get_functiondef(p.oid) ilike '%teaching scope%'
  loop
    execute format('drop trigger %I on public.%I', blocked.tgname, blocked.relname);
    raise notice 'dropped teaching-scope trigger % on %', blocked.tgname, blocked.relname;
  end loop;
end $$;

-- 2. Give the drifted NOT NULL columns defaults so an insert built from the committed schema
--    succeeds on its own. The application also supplies these values explicitly.
do $$
declare
  target record;
  defaults constant text[][] := array[
    ['faculty_assignments', 'effective_from', 'current_date'],
    ['timetable_entries',   'effective_from', 'current_date'],
    ['timetable_entries',   'is_active',      'true'],
    -- Must stay 0: faculty_assignments_subject_hours_check requires zero weekly hours for
    -- class_teacher and faculty_guide rows, and the application sets a positive value itself
    -- for subject_faculty and lab_faculty.
    ['faculty_assignments', 'weekly_hours',   '0']
  ];
  i int;
begin
  for i in 1 .. array_length(defaults, 1) loop
    select defaults[i][1] as tbl, defaults[i][2] as col, defaults[i][3] as val into target;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target.tbl and column_name = target.col
    ) then
      execute format('alter table public.%I alter column %I set default %s', target.tbl, target.col, target.val);
      raise notice 'set default on %.%', target.tbl, target.col;
    end if;
  end loop;
end $$;

-- 3. timetable_entries.academic_year_id, department_id and semester_id are NOT NULL with no
--    sensible static default. They are derived from the section by the application, so nothing
--    is altered here; this comment records why they are deliberately left alone.
