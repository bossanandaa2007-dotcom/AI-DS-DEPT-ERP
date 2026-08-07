-- `profiles_select` from 202607160103_clean_security.sql lets a student read exactly one row:
-- their own. Every other role can read the department. That is right for student-to-student
-- privacy, but it also hides the teaching staff, so a student's timetable, attendance and
-- marks screens cannot resolve the name of the faculty who teach them. With 148 timetable
-- entries all carrying a faculty_id, the student timetable rendered "Unassigned" on every
-- single period, which reads as "no teacher is allocated to your class".
--
-- This adds one narrow clause: a student may read the profiles of teaching staff in their own
-- department. Student-to-student visibility is unchanged, because only rows whose role is
-- faculty, hod or lab_assistant can match the new clause.
--
-- Every other branch of the policy is reproduced verbatim; Postgres has no "alter policy to
-- add a clause", so the policy has to be recreated whole.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.can_manage_department(department_id)
  or (
    public.current_department_id() = department_id
    and public.current_role() in ('faculty', 'lab_assistant')
  )
  or (
    public.current_role() = 'student'
    and public.current_department_id() = department_id
    and profiles.role in ('faculty', 'hod', 'lab_assistant')
  )
);
