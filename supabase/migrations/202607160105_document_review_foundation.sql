-- Prompt 1: private-document limits and manual departmental verification foundation.
-- This migration is intentionally local-only; apply it through the normal reviewed migration workflow.

alter type public.attachment_entity add value if not exists 'project';
alter type public.attachment_entity add value if not exists 'competition';

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'attachment_verification_status'
  ) then
    create type public.attachment_verification_status as enum (
      'pending_faculty_review',
      'faculty_rejected',
      'pending_jury_review',
      'jury_rejected',
      'verified',
      'replaced',
      'requires_jury_review'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'attachment_review_decision'
  ) then
    create type public.attachment_review_decision as enum ('approved', 'rejected');
  end if;
end
$$;

alter table public.attachments drop constraint if exists attachments_size_bytes_check;
alter table public.attachments add constraint attachments_size_bytes_check check (size_bytes > 0 and size_bytes <= 1048576);
alter table public.attachments add column if not exists verification_status public.attachment_verification_status not null default 'pending_faculty_review';
alter table public.attachments add column if not exists requires_jury_review boolean not null default false;
alter table public.attachments add column if not exists faculty_reviewer_id uuid references public.profiles(id) on delete set null;
alter table public.attachments add column if not exists faculty_reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.attachments add column if not exists faculty_reviewed_at timestamptz;
alter table public.attachments add column if not exists faculty_review_comment text;
alter table public.attachments add column if not exists jury_reviewer_id uuid references public.profiles(id) on delete set null;
alter table public.attachments add column if not exists jury_reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.attachments add column if not exists jury_reviewed_at timestamptz;
alter table public.attachments add column if not exists jury_review_comment text;
alter table public.attachments add column if not exists verified_at timestamptz;
alter table public.attachments add column if not exists replacement_for_attachment_id uuid references public.attachments(id) on delete set null;
alter table public.attachments add column if not exists is_active boolean not null default true;

alter table public.faculty_assignments add column if not exists is_jury_eligible boolean not null default false;

create index if not exists attachments_faculty_reviewer_idx on public.attachments(faculty_reviewer_id) where is_active;
create index if not exists attachments_jury_reviewer_idx on public.attachments(jury_reviewer_id) where is_active;
create index if not exists faculty_assignments_active_jury_idx on public.faculty_assignments(faculty_id) where is_active and is_jury_eligible;

update storage.buckets
set public = false,
    file_size_limit = 1048576,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id in (
  'leave-documents',
  'gate-pass-documents',
  'od-proofs',
  'od-certificates',
  'complaint-attachments',
  'announcement-attachments'
);

create or replace function public.set_attachment_initial_review_state() returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  new.verification_status := 'pending_faculty_review';
  new.requires_jury_review := new.entity_type::text in ('project', 'competition')
    or new.bucket_id in ('od-proofs', 'od-certificates');
  new.faculty_reviewer_id := null;
  new.faculty_reviewed_by := null;
  new.faculty_reviewed_at := null;
  new.faculty_review_comment := null;
  new.jury_reviewer_id := null;
  new.jury_reviewed_by := null;
  new.jury_reviewed_at := null;
  new.jury_review_comment := null;
  new.verified_at := null;
  new.replacement_for_attachment_id := null;
  new.is_active := true;
  return new;
end;
$$;

drop trigger if exists attachments_initial_review_state on public.attachments;
create trigger attachments_initial_review_state
before insert on public.attachments
for each row execute procedure public.set_attachment_initial_review_state();

create or replace function public.require_active_faculty_reviewer(p_profile_id uuid, p_department_id uuid, p_require_jury_eligibility boolean default false)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'faculty'
      and p.status = 'active'
      and p.department_id = p_department_id
      and (
        not p_require_jury_eligibility
        or exists (
          select 1
          from public.faculty_assignments fa
          where fa.faculty_id = p.id
            and fa.is_active
            and fa.is_jury_eligible
        )
      )
  ) then
    raise exception 'Reviewer must be an active Faculty member eligible for this department review.';
  end if;
end;
$$;
revoke all on function public.require_active_faculty_reviewer(uuid, uuid, boolean) from public;

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
  if not public.can_manage_department(v_department_id) then raise exception 'Only the HOD or Super Admin can assign document reviewers.'; end if;
  if not v_attachment.is_active or v_attachment.verification_status <> 'pending_faculty_review' then raise exception 'Reviewers can only be assigned to an active pending Faculty review.'; end if;
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
  where id = v_attachment.id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, before_data, after_data)
  values (auth.uid(), public.current_role(), 'assign_reviewers', 'attachments', v_attachment.id::text,
    jsonb_build_object('faculty_reviewer_id', v_attachment.faculty_reviewer_id, 'jury_reviewer_id', v_attachment.jury_reviewer_id),
    jsonb_build_object('faculty_reviewer_id', p_faculty_reviewer_id, 'jury_reviewer_id', p_jury_reviewer_id));
end;
$$;

create or replace function public.review_attachment_as_faculty(
  p_attachment_id uuid,
  p_decision public.attachment_review_decision,
  p_comments text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_attachment public.attachments%rowtype;
  v_department_id uuid;
  v_next_status public.attachment_verification_status;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select a.* into v_attachment from public.attachments a where a.id = p_attachment_id for update;
  if not found then raise exception 'Attachment not found.'; end if;
  select department_id into v_department_id from public.profiles where id = v_attachment.owner_id;
  if v_attachment.owner_id = auth.uid() then raise exception 'A document owner cannot review their own document.'; end if;
  perform public.require_active_faculty_reviewer(auth.uid(), v_department_id, false);
  if not v_attachment.is_active or v_attachment.verification_status <> 'pending_faculty_review' or v_attachment.faculty_reviewer_id <> auth.uid() then
    raise exception 'This attachment is not assigned for your pending Faculty review.';
  end if;
  if p_decision = 'rejected' and coalesce(length(trim(p_comments)), 0) = 0 then
    raise exception 'A Faculty rejection reason is required.';
  end if;
  if p_decision = 'approved' and v_attachment.requires_jury_review and v_attachment.jury_reviewer_id is null then
    raise exception 'Assign a Jury reviewer before approving this document.';
  end if;

  v_next_status := case
    when p_decision = 'rejected' then 'faculty_rejected'
    when v_attachment.requires_jury_review then 'pending_jury_review'
    else 'verified'
  end;
  update public.attachments
  set verification_status = v_next_status,
      faculty_reviewed_by = auth.uid(),
      faculty_reviewed_at = now(),
      faculty_review_comment = nullif(trim(p_comments), ''),
      verified_at = case when v_next_status = 'verified' then now() else null end
  where id = v_attachment.id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, before_data, after_data)
  values (auth.uid(), public.current_role(), 'faculty_review', 'attachments', v_attachment.id::text,
    jsonb_build_object('verification_status', v_attachment.verification_status),
    jsonb_build_object('verification_status', v_next_status, 'comments', nullif(trim(p_comments), '')));
end;
$$;

create or replace function public.review_attachment_as_jury(
  p_attachment_id uuid,
  p_decision public.attachment_review_decision,
  p_comments text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_attachment public.attachments%rowtype;
  v_department_id uuid;
  v_next_status public.attachment_verification_status;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select a.* into v_attachment from public.attachments a where a.id = p_attachment_id for update;
  if not found then raise exception 'Attachment not found.'; end if;
  select department_id into v_department_id from public.profiles where id = v_attachment.owner_id;
  if v_attachment.owner_id = auth.uid() then raise exception 'A document owner cannot review their own document.'; end if;
  perform public.require_active_faculty_reviewer(auth.uid(), v_department_id, true);
  if not v_attachment.is_active or not v_attachment.requires_jury_review or v_attachment.verification_status <> 'pending_jury_review' or v_attachment.jury_reviewer_id <> auth.uid() then
    raise exception 'This attachment is not assigned for your pending Jury review.';
  end if;
  if p_decision = 'rejected' and coalesce(length(trim(p_comments)), 0) = 0 then
    raise exception 'A Jury rejection reason is required.';
  end if;

  v_next_status := case when p_decision = 'rejected' then 'jury_rejected' else 'verified' end;
  update public.attachments
  set verification_status = v_next_status,
      jury_reviewed_by = auth.uid(),
      jury_reviewed_at = now(),
      jury_review_comment = nullif(trim(p_comments), ''),
      verified_at = case when v_next_status = 'verified' then now() else null end
  where id = v_attachment.id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, before_data, after_data)
  values (auth.uid(), public.current_role(), 'jury_review', 'attachments', v_attachment.id::text,
    jsonb_build_object('verification_status', v_attachment.verification_status),
    jsonb_build_object('verification_status', v_next_status, 'comments', nullif(trim(p_comments), '')));
end;
$$;

create or replace function public.register_attachment_replacement(
  p_original_attachment_id uuid,
  p_replacement_attachment_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_original public.attachments%rowtype;
  v_replacement public.attachments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select a.* into v_original from public.attachments a where a.id = p_original_attachment_id for update;
  if not found then raise exception 'Original attachment not found.'; end if;
  select a.* into v_replacement from public.attachments a where a.id = p_replacement_attachment_id for update;
  if not found then raise exception 'Replacement attachment not found.'; end if;
  if v_original.owner_id <> auth.uid() or v_replacement.owner_id <> auth.uid() then raise exception 'Only the document owner can register a replacement.'; end if;
  if not v_original.is_active or v_original.verification_status not in ('faculty_rejected', 'jury_rejected') then raise exception 'Only a rejected active attachment can be replaced.'; end if;
  if not v_replacement.is_active or v_replacement.verification_status <> 'pending_faculty_review' or v_replacement.replacement_for_attachment_id is not null then raise exception 'The replacement must be a new pending attachment.'; end if;
  if (v_original.entity_type, v_original.entity_id) is distinct from (v_replacement.entity_type, v_replacement.entity_id) then raise exception 'A replacement must belong to the same record.'; end if;

  update public.attachments
  set is_active = false,
      verification_status = 'replaced'
  where id = v_original.id;
  update public.attachments
  set replacement_for_attachment_id = v_original.id
  where id = v_replacement.id;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, before_data, after_data)
  values (auth.uid(), public.current_role(), 'register_replacement', 'attachments', v_original.id::text,
    jsonb_build_object('verification_status', v_original.verification_status, 'is_active', true),
    jsonb_build_object('verification_status', 'replaced', 'replacement_attachment_id', v_replacement.id));
end;
$$;

revoke all on function public.assign_attachment_reviewers(uuid, uuid, uuid) from public;
revoke all on function public.review_attachment_as_faculty(uuid, public.attachment_review_decision, text) from public;
revoke all on function public.review_attachment_as_jury(uuid, public.attachment_review_decision, text) from public;
revoke all on function public.register_attachment_replacement(uuid, uuid) from public;
grant execute on function public.assign_attachment_reviewers(uuid, uuid, uuid) to authenticated;
grant execute on function public.review_attachment_as_faculty(uuid, public.attachment_review_decision, text) to authenticated;
grant execute on function public.review_attachment_as_jury(uuid, public.attachment_review_decision, text) to authenticated;
grant execute on function public.register_attachment_replacement(uuid, uuid) to authenticated;

drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_delete on public.attachments;
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using (
  owner_id = auth.uid()
  or public.can_manage_department((select p.department_id from public.profiles p where p.id = owner_id))
  or faculty_reviewer_id = auth.uid()
  or jury_reviewer_id = auth.uid()
);
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated with check (
  owner_id = auth.uid()
  and verification_status = 'pending_faculty_review'
  and faculty_reviewer_id is null
  and faculty_reviewed_by is null
  and jury_reviewer_id is null
  and jury_reviewed_by is null
  and verified_at is null
  and replacement_for_attachment_id is null
  and is_active
);
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated using (
  owner_id = auth.uid()
  and is_active
  and verification_status = 'pending_faculty_review'
  and faculty_reviewer_id is null
  and not exists (select 1 from public.requests r where r.id = entity_id and r.is_locked)
);

drop policy if exists private_document_read on storage.objects;
drop policy if exists private_document_delete on storage.objects;
drop policy if exists private_document_read on storage.objects;
create policy private_document_read on storage.objects for select to authenticated using (
  owner_id = (select auth.uid()::text)
  or exists (
    select 1
    from public.attachments a
    join public.profiles p on p.id = a.owner_id
    where a.bucket_id = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and (
        public.can_manage_department(p.department_id)
        or a.faculty_reviewer_id = auth.uid()
        or a.jury_reviewer_id = auth.uid()
      )
  )
);
drop policy if exists private_document_delete on storage.objects;
create policy private_document_delete on storage.objects for delete to authenticated using (
  owner_id = (select auth.uid()::text)
);
