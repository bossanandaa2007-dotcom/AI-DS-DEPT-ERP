-- Pilot runtime repair: permit an active enrolled student to submit one daily check-in
-- through a narrowly scoped RPC.  Direct attendance-record writes remain faculty-only.

create or replace function public.student_daily_check_in(p_session_id uuid)
returns public.attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
  v_session public.attendance_sessions;
  v_record public.attendance_records;
  v_checked_in_at timestamptz := now();
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid()
  for share;

  if not found or v_profile.role <> 'student' or v_profile.status <> 'active' then
    raise exception 'Only an active student profile can submit a daily check-in';
  end if;

  select * into v_session
  from public.attendance_sessions
  where id = p_session_id
  for share;

  if not found or v_session.session_type <> 'daily' or v_session.status <> 'open' then
    raise exception 'Daily attendance is not open for check-in';
  end if;

  if v_session.attendance_date <> current_date or v_profile.section_id is distinct from v_session.section_id then
    raise exception 'This daily attendance session is not available to the current student';
  end if;

  if not exists (
    select 1
    from public.enrollments e
    where e.student_id = auth.uid()
      and e.section_id = v_session.section_id
      and e.status = 'active'
  ) then
    raise exception 'The current student has no active enrollment for this daily attendance session';
  end if;

  insert into public.attendance_records (
    session_id,
    student_id,
    status,
    check_in_time,
    verification_data
  )
  values (
    v_session.id,
    auth.uid(),
    'present',
    v_checked_in_at,
    jsonb_build_object('source', 'student_check_in', 'verification_state', 'pending', 'submitted_at', v_checked_in_at)
  )
  on conflict (session_id, student_id) do nothing
  returning * into v_record;

  if not found then
    raise exception 'A daily check-in has already been submitted for this session';
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, module, record_reference, after_data)
  values (auth.uid(), v_profile.role, 'student_daily_check_in', 'attendance', v_record.id::text, jsonb_build_object('session_id', v_session.id));

  return v_record;
end;
$$;

revoke all on function public.student_daily_check_in(uuid) from public;
grant execute on function public.student_daily_check_in(uuid) to authenticated;
