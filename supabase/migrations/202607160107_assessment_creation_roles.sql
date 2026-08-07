-- Assessment creation belongs to the Super Admin and HOD.  Faculty keep mark entry and
-- finalization, which still need UPDATE on the assessment row because saving draft marks
-- rolls the assessment status between 'draft' and 'completed'.
--
-- Replaces the single permissive `assessments_write` FOR ALL policy, which let any assigned
-- Faculty member insert assessments.

drop policy if exists assessments_write on public.assessments;

drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert on public.assessments for insert to authenticated
  with check (public.can_manage_department((select s.department_id from public.sections s where s.id = section_id)));

-- Faculty who teach the section/subject may update a non-finalized assessment.  This is
-- keyed on can_teach rather than faculty_id so a co-teaching or Class Teacher entry still
-- rolls the status up; finalization itself remains restricted to the assessment's own
-- faculty_id inside public.finalize_marks.
drop policy if exists assessments_update on public.assessments;
create policy assessments_update on public.assessments for update to authenticated
  using (
    (public.can_teach(section_id, subject_id) and status <> 'finalized')
    or public.can_manage_department((select s.department_id from public.sections s where s.id = section_id))
  )
  with check (
    (public.can_teach(section_id, subject_id) and status <> 'finalized')
    or public.can_manage_department((select s.department_id from public.sections s where s.id = section_id))
  );

drop policy if exists assessments_delete on public.assessments;
create policy assessments_delete on public.assessments for delete to authenticated
  using (public.can_manage_department((select s.department_id from public.sections s where s.id = section_id)));
