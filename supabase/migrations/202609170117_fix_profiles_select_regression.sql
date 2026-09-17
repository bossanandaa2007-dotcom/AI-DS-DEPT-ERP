-- 202608060111 and 202608080113 each redefine profiles_select and each added one clause the
-- other lacks: 111 added "a student may read their department's teaching staff" (so timetable,
-- attendance and marks can resolve a faculty name instead of "Unassigned"); 113 added "hod" to
-- the staff-visibility clause, needed because it also tightened can_manage_department() to
-- super_admin-only, which had been HOD's path to seeing the department roster. Applied in
-- version order, 113 runs after 111 and silently drops 111's clause -- confirmed live via
-- supabase/pilot/5-verify-student-visibility.mjs, which regressed from "18 staff visible, 35/35
-- periods nameable" to "0 staff visible, 0/35 nameable" the moment both were actually executed
-- together for the first time. This recreates the policy with every clause from both.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.can_manage_department(department_id)
  or (
    public.current_department_id() = department_id
    and public.current_role() in ('hod', 'faculty', 'lab_assistant')
  )
  or (
    public.current_role() = 'student'
    and public.current_department_id() = department_id
    and profiles.role in ('faculty', 'hod', 'lab_assistant')
  )
);
