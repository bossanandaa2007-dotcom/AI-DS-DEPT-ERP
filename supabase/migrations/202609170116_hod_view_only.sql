-- 202608080113 made Super Admin the operational owner department-wide by redefining
-- can_manage_department() to super_admin-only, but deliberately kept two named exceptions for
-- HOD: authoring their own announcements, and resolving complaints. HOD is now view-only with no
-- exceptions, so both are removed here. Nothing here touches HOD's read/select access -- HOD
-- still sees announcements (can_access_announcement) and complaints (complaints_select) exactly
-- as before; only the ability to write is removed.

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
using (
  author_id = auth.uid()
  or public.can_manage_department(department_id)
)
with check (
  (author_id = auth.uid() and public.current_role() in ('faculty','super_admin'))
  or public.can_manage_department(department_id)
);

drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints for update to authenticated
using (
  assigned_to = auth.uid()
  or public.can_manage_department(department_id)
)
with check (
  assigned_to = auth.uid()
  or public.can_manage_department(department_id)
);

-- assign_attachment_reviewers already required can_manage_department() (super_admin-only since
-- 202608080113); only the error message still claimed HOD could do this.
create or replace function public.assign_attachment_reviewers(
  p_attachment_id uuid,
  p_faculty_reviewer_id uuid,
  p_jury_reviewer_id uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_attachment public.attachments%rowtype;
  v_department_id uuid;
begin
  select a.* into v_attachment from public.attachments a where a.id = p_attachment_id for update;
  if not found then raise exception 'Attachment not found.'; end if;
  select department_id into v_department_id from public.profiles where id = v_attachment.owner_id;
  if not public.can_manage_department(v_department_id) then raise exception 'Only the Super Admin can assign document reviewers.'; end if;
  if p_faculty_reviewer_id = v_attachment.owner_id then raise exception 'A document owner cannot review their own document.'; end if;
  perform public.require_active_faculty_reviewer(p_faculty_reviewer_id, v_department_id, false);
  if v_attachment.requires_jury_review then
    if p_jury_reviewer_id is null then raise exception 'A Jury reviewer is required for this document.'; end if;
    if p_jury_reviewer_id = v_attachment.owner_id then raise exception 'A document owner cannot review their own document.'; end if;
    perform public.require_active_faculty_reviewer(p_jury_reviewer_id, v_department_id, true);
  elsif p_jury_reviewer_id is not null then
    raise exception 'A Jury reviewer is not required for this document.';
  end if;
  update public.attachments
  set faculty_reviewer_id = p_faculty_reviewer_id,
      jury_reviewer_id = p_jury_reviewer_id
  where id = p_attachment_id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, before_data, after_data)
  values (auth.uid(), public.current_role(), 'assign_reviewers', 'attachments', v_attachment.id::text,
    jsonb_build_object('faculty_reviewer_id', v_attachment.faculty_reviewer_id, 'jury_reviewer_id', v_attachment.jury_reviewer_id),
    jsonb_build_object('faculty_reviewer_id', p_faculty_reviewer_id, 'jury_reviewer_id', p_jury_reviewer_id));
end; $$;
revoke all on function public.assign_attachment_reviewers(uuid, uuid, uuid) from public;
grant execute on function public.assign_attachment_reviewers(uuid, uuid, uuid) to authenticated;
