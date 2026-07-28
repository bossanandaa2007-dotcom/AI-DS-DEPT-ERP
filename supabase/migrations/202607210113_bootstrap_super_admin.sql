-- A system-only audit actor is required for the local bootstrap script.
do $$
begin
  if not exists (
    select 1 from pg_enum enum_value
    join pg_type enum_type on enum_type.oid = enum_value.enumtypid
    join pg_namespace enum_schema on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public' and enum_type.typname = 'app_role' and enum_value.enumlabel = 'system'
  ) then
    alter type public.app_role add value 'system';
  end if;
end
$$;
