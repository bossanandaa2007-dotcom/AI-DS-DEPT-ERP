create or replace function public.can_publish_announcement(
  p_author_id uuid,
  p_department_id uuid,
  p_audience text,
  p_target jsonb
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  with actor as (
    select id, role, status, department_id
    from public.profiles
    where id = auth.uid()
  ),
  recipient_ids as (
    select value as profile_id
    from jsonb_array_elements_text(coalesce(p_target -> 'profile_ids', '[]'::jsonb))
  )
  select exists (
    select 1
    from actor
    where id = p_author_id
      and status = 'active'
      and (
        role = 'super_admin'
        or (role = 'hod' and department_id = p_department_id)
        or (role = 'faculty' and department_id = p_department_id)
        or (
          role = 'lab_assistant'
          and department_id = p_department_id
          and p_audience in ('department', 'section', 'assigned_students')
          and (
            p_audience = 'department'
            or (
              p_audience = 'section'
              and (p_target ->> 'section_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and exists (
                select 1
                from public.timetable_entries entry
                join public.sections section on section.id = entry.section_id
                where entry.lab_assistant_id = auth.uid()
                  and entry.is_active
                  and entry.section_id = (p_target ->> 'section_id')::uuid
                  and section.department_id = p_department_id
              )
            )
            or (
              p_audience = 'assigned_students'
              and jsonb_typeof(coalesce(p_target -> 'profile_ids', '[]'::jsonb)) = 'array'
              and jsonb_array_length(coalesce(p_target -> 'profile_ids', '[]'::jsonb)) > 0
              and not exists (
                select 1
                from recipient_ids recipient
                where recipient.profile_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  or not exists (
                    select 1
                    from public.profiles student
                    join public.timetable_entries entry on entry.section_id = student.section_id
                    where student.id = recipient.profile_id::uuid
                      and student.role = 'student'
                      and student.status = 'active'
                      and student.department_id = p_department_id
                      and entry.lab_assistant_id = auth.uid()
                      and entry.is_active
                  )
              )
            )
          )
        )
      )
  )
$$;

revoke all on function public.can_publish_announcement(uuid, uuid, text, jsonb) from public;
grant execute on function public.can_publish_announcement(uuid, uuid, text, jsonb) to authenticated;

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
using (author_id = auth.uid() or public.can_manage_department(department_id))
with check (public.can_publish_announcement(author_id, department_id, audience, target));
