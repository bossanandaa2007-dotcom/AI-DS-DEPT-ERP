-- Safe reference data only. This seed never creates Auth users or profiles.
with department as (
  insert into public.departments (code, name)
  values ('AI-DS', 'Artificial Intelligence and Data Science')
  on conflict (code) do update set name = excluded.name
  returning id
), academic_year as (
  insert into public.academic_years (department_id, name, starts_on, ends_on, is_active)
  select id, '2026-2027', date '2026-06-01', date '2027-05-31', true from department
  on conflict (department_id, name) do update set is_active = true
  returning id
)
insert into public.semesters (academic_year_id, number, name, starts_on, ends_on)
select id, value, 'Semester ' || value, date '2026-06-01', date '2026-11-30'
from academic_year cross join generate_series(1, 2) value
on conflict (academic_year_id, number) do nothing;

insert into public.sections (department_id, academic_year_id, semester_id, year_number, name, capacity)
select d.id, y.id, s.id, 1, v.section_name, 60
from public.departments d join public.academic_years y on y.department_id = d.id and y.name = '2026-2027'
join public.semesters s on s.academic_year_id = y.id cross join (values ('A'), ('B')) v(section_name)
where d.code = 'AI-DS'
on conflict (academic_year_id, semester_id, year_number, name) do nothing;

insert into public.subjects (department_id, semester_id, code, name, credits, is_lab)
select d.id, s.id, v.code, v.name, v.credits, v.is_lab
from public.departments d join public.academic_years y on y.department_id = d.id and y.name = '2026-2027'
join public.semesters s on s.academic_year_id = y.id and s.number = 1
cross join (values
  ('ADS101', 'Programming for Data Science', 4.0::numeric, false),
  ('ADS102', 'Mathematics for AI', 4.0::numeric, false),
  ('ADSL101', 'Data Science Laboratory', 2.0::numeric, true)
) v(code, name, credits, is_lab)
where d.code = 'AI-DS'
on conflict (department_id, semester_id, code) do nothing;
