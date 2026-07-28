-- Admin account provisioning support. Auth credentials are only handled by the Edge Function.

alter table public.profiles
  add column if not exists date_of_birth date;

-- The legacy unique constraint is retained; this index additionally rejects case-only duplicates.
create unique index if not exists profiles_employee_or_register_number_ci_key
  on public.profiles (lower(btrim(employee_or_register_number)))
  where employee_or_register_number is not null;

comment on column public.profiles.date_of_birth is
  'Account-provisioning data. Never expose this value through provisioning responses or audit logs.';

create or replace function public.prevent_profile_date_of_birth_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.date_of_birth is not null and new.date_of_birth is distinct from old.date_of_birth then
    raise exception 'Date of birth cannot be changed after account provisioning';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_date_of_birth_immutable on public.profiles;
create trigger profiles_date_of_birth_immutable
  before update on public.profiles
  for each row execute procedure public.prevent_profile_date_of_birth_change();
