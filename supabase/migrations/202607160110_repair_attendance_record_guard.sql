-- UPDATE and DELETE on public.attendance_records fail for every caller with
--   42703: record "old" has no field "locked"
-- A drifted trigger function references OLD.locked, a column attendance_records does not have.
-- Only INSERT works, so a Faculty member can submit an attendance sheet once and can never
-- correct it, re-submit it, or have an approved correction applied.
--
-- This restores the guard defined in 202607160103_clean_security.sql: finalized attendance stays
-- read-only except through the correction RPCs, and ordinary edits to an open session work again.

-- 1. Reinstate the intended guard. Resolving the session id per operation avoids touching NEW on
--    DELETE, which is unassigned there.
create or replace function public.prevent_finalized_attendance_change() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare target_session uuid;
begin
  if tg_op = 'DELETE' then target_session := old.session_id; else target_session := new.session_id; end if;
  if exists (select 1 from public.attendance_sessions s where s.id = target_session and s.status in ('finalized', 'locked'))
     and current_setting('app.correction_write', true) is distinct from 'on' then
    raise exception 'Finalized attendance may only be changed through an approved correction';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

-- 2. Drop any other trigger on attendance_records whose function still reads a `locked` field,
--    matched on the function body rather than a guessed trigger name.
do $$
declare broken record;
begin
  for broken in
    select tg.tgname, p.proname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid and c.relnamespace = 'public'::regnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where c.relname = 'attendance_records'
      and not tg.tgisinternal
      and p.proname <> 'prevent_finalized_attendance_change'
      and pg_get_functiondef(p.oid) ~* '\m(old|new)\.locked\M'
  loop
    execute format('drop trigger %I on public.attendance_records', broken.tgname);
    raise notice 'dropped broken trigger % (function %) on attendance_records', broken.tgname, broken.proname;
  end loop;
end $$;

-- 3. Rebind the guard.
drop trigger if exists attendance_records_finalized_guard on public.attendance_records;
create trigger attendance_records_finalized_guard
  before update or delete on public.attendance_records
  for each row execute procedure public.prevent_finalized_attendance_change();

-- 4. An attendance session opened by mistake currently cannot be removed by anyone: the table has
--    select, insert and update policies but no delete policy, so DELETE silently affects no rows.
--    Allow the department managers who can already correct a session to remove one.
drop policy if exists attendance_sessions_admin_delete on public.attendance_sessions;
create policy attendance_sessions_admin_delete on public.attendance_sessions for delete to authenticated
  using (public.can_manage_department((select s.department_id from public.sections s where s.id = section_id)));
