-- Break the projects/project_members RLS recursion with narrowly scoped helpers.

create or replace function public.is_project_member(p_project_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_members member
    where member.project_id = p_project_id and member.student_id = p_profile_id
  )
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects project
    where project.id = p_project_id
      and (project.faculty_guide_id = auth.uid() or public.can_manage_department(project.department_id))
  )
$$;

revoke all on function public.is_project_member(uuid, uuid) from public;
revoke all on function public.can_manage_project(uuid) from public;
grant execute on function public.is_project_member(uuid, uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  public.can_manage_department(department_id)
  or faculty_guide_id = auth.uid()
  or public.is_project_member(id, auth.uid())
);

drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for all to authenticated
using (public.can_manage_project(id))
with check (public.can_manage_department(department_id) or faculty_guide_id = auth.uid());

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members for select to authenticated using (
  student_id = auth.uid() or public.can_manage_project(project_id)
);

drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members for all to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

