insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('leave-documents','leave-documents',false,3145728,array['application/pdf','image/jpeg','image/png']),
  ('gate-pass-documents','gate-pass-documents',false,3145728,array['application/pdf','image/jpeg','image/png']),
  ('od-proofs','od-proofs',false,3145728,array['application/pdf','image/jpeg','image/png']),
  ('od-certificates','od-certificates',false,3145728,array['application/pdf','image/jpeg','image/png']),
  ('complaint-attachments','complaint-attachments',false,3145728,array['application/pdf','image/jpeg','image/png']),
  ('announcement-attachments','announcement-attachments',false,3145728,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

do $migration$
begin
  if to_regprocedure('public.owns_document_path(text)') is null then
    execute $function$
create or replace function public.owns_document_path(p_name text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select split_part(p_name,'/',2) = auth.uid()::text and array_length(string_to_array(p_name,'/'),1) = 5 $$;
$function$;
  end if;
end
$migration$;
do $migration$
begin
  if to_regprocedure('public.can_view_document(text,text,text)') is null then
    execute $function$
create or replace function public.can_view_document(p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select p_owner=auth.uid()::text or (p_bucket='complaint-attachments' and exists(select 1 from public.complaints where student_id=p_owner::uuid and (assigned_to=auth.uid() or public.is_hod()))) or (p_bucket in ('leave-documents','gate-pass-documents','od-proofs','od-certificates') and (public.is_hod() or exists(select 1 from public.projects where student_id=p_owner::uuid and faculty_guide_id=auth.uid()))) $$;
$function$;
  end if;
end
$migration$;
revoke all on function public.owns_document_path(text), public.can_view_document(text,text,text) from public;
grant execute on function public.owns_document_path(text), public.can_view_document(text,text,text) to authenticated;

drop policy if exists private_document_insert on storage.objects;
create policy private_document_insert on storage.objects for insert to authenticated with check (bucket_id in ('leave-documents','gate-pass-documents','od-proofs','od-certificates','complaint-attachments','announcement-attachments') and owner_id=auth.uid()::text and public.owns_document_path(name));
drop policy if exists private_document_read on storage.objects;
create policy private_document_read on storage.objects for select to authenticated using (bucket_id in ('leave-documents','gate-pass-documents','od-proofs','od-certificates','complaint-attachments','announcement-attachments') and public.can_view_document(bucket_id,name,owner_id));
drop policy if exists private_document_delete on storage.objects;
create policy private_document_delete on storage.objects for delete to authenticated using (bucket_id in ('leave-documents','gate-pass-documents','od-proofs','od-certificates','complaint-attachments','announcement-attachments') and owner_id=auth.uid()::text and public.owns_document_path(name));
