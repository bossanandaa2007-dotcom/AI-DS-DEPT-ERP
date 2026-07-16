-- Private document storage. Applications use short-lived signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('leave-documents', 'leave-documents', false, 3145728, array['application/pdf','image/jpeg','image/png']),
  ('gate-pass-documents', 'gate-pass-documents', false, 3145728, array['application/pdf','image/jpeg','image/png']),
  ('od-proofs', 'od-proofs', false, 3145728, array['application/pdf','image/jpeg','image/png']),
  ('od-certificates', 'od-certificates', false, 3145728, array['application/pdf','image/jpeg','image/png']),
  ('complaint-attachments', 'complaint-attachments', false, 3145728, array['application/pdf','image/jpeg','image/png']),
  ('announcement-attachments', 'announcement-attachments', false, 3145728, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists private_document_upload on storage.objects;
create policy private_document_upload on storage.objects for insert to authenticated with check (
  bucket_id in ('leave-documents', 'gate-pass-documents', 'od-proofs', 'od-certificates', 'complaint-attachments', 'announcement-attachments')
  and owner_id = (select auth.uid()::text)
  and split_part(name, '/', 2) = (select auth.uid()::text)
  and array_length(storage.foldername(name), 1) = 4
);
drop policy if exists private_document_read on storage.objects;
create policy private_document_read on storage.objects for select to authenticated using (
  owner_id = (select auth.uid()::text)
  or exists (select 1 from public.attachments a where a.bucket_id = storage.objects.bucket_id and a.object_path = storage.objects.name and public.has_role(array['super_admin','hod']::public.app_role[]))
);
drop policy if exists private_document_delete on storage.objects;
create policy private_document_delete on storage.objects for delete to authenticated using (owner_id = (select auth.uid()::text));
