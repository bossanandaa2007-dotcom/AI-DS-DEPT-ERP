-- A lock with no way back is a real operational risk -- proven immediately during manual testing
-- of 202609170114, which locked one genuine (if empty) attendance session by mistake. These two
-- RPCs give Super Admin a symmetric, audited undo, mirroring the lock functions exactly.

create or replace function public.unlock_attendance_for_section(p_section_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if public.current_role() <> 'super_admin' then raise exception 'Only the Super Admin can unlock a class''s attendance'; end if;
  if not exists (select 1 from public.sections where id = p_section_id) then raise exception 'Section not found'; end if;
  update public.attendance_sessions set status = 'open' where section_id = p_section_id and status = 'locked';
  get diagnostics v_count = row_count;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), public.current_role(), 'unlock', 'attendance', p_section_id::text, jsonb_build_object('sessions_unlocked', v_count));
  return v_count;
end; $$;
revoke all on function public.unlock_attendance_for_section(uuid) from public;
grant execute on function public.unlock_attendance_for_section(uuid) to authenticated;

create or replace function public.unlock_marks_for_section(p_section_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if public.current_role() <> 'super_admin' then raise exception 'Only the Super Admin can unlock a class''s marks'; end if;
  if not exists (select 1 from public.sections where id = p_section_id) then raise exception 'Section not found'; end if;
  update public.assessments set status = 'draft' where section_id = p_section_id and status = 'finalized';
  get diagnostics v_count = row_count;
  insert into public.audit_logs(actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), public.current_role(), 'unlock', 'marks', p_section_id::text, jsonb_build_object('assessments_unlocked', v_count));
  return v_count;
end; $$;
revoke all on function public.unlock_marks_for_section(uuid) from public;
grant execute on function public.unlock_marks_for_section(uuid) to authenticated;
