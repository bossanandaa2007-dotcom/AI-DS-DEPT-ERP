-- The pilot proposal (Section 6.1) explicitly gives HOD the ability to "publish announcements
-- to faculty, students or the entire department." 202609170116_hod_view_only.sql removed that
-- along with HOD's complaint-resolution rights under a general view-only directive; on review
-- against the proposal, only complaint resolution was actually unassigned to HOD there --
-- announcement publishing is a named HOD duty, so it is restored here. complaints_update is
-- untouched (stays Super Admin-only).

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
using (
  author_id = auth.uid()
  or public.can_manage_department(department_id)
)
with check (
  (author_id = auth.uid() and public.current_role() in ('faculty','hod','super_admin'))
  or public.can_manage_department(department_id)
);
