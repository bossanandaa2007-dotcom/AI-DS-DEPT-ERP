-- public.timetable_entries lost INSERT/UPDATE/DELETE for the `authenticated` role, so every
-- timetable write failed with `42501: permission denied for table timetable_entries` before
-- RLS was ever consulted.  SELECT was unaffected, which is why the grid could read entries but
-- not create them.  Every other table in the schema still had the privileges granted by
-- 202607160103_clean_security.sql, so this was specific to this table -- most likely the table
-- was replaced after that migration's `grant ... on all tables` had already run.
--
-- Row visibility is unchanged: the timetable_entries_select and timetable_entries_admin
-- policies still decide who may read and write which rows.

grant select, insert, update, delete on public.timetable_entries to authenticated;

-- Re-assert the schema-wide baseline so any other table added after 202607160103 is covered too.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- New tables created from now on inherit the same baseline.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
