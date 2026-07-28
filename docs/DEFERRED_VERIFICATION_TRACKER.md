# Deferred verification tracker

## Prompt 3 — timetable workflow

| Item | Status | Reason |
| --- | --- | --- |
| Migration application | Deferred | No linked Supabase instance is available in this workspace. |
| RPC authorization and atomic conflict validation | Deferred | Requires authenticated Super Admin/HOD and cross-role test accounts against the migrated database. |
| RLS role matrix | Deferred | Requires live Super Admin, HOD, Faculty, Student, and Lab Assistant sessions. |
| Attendance-linked replacement protection | Deferred | Requires a live attendance session referencing a timetable entry. |
| Period settings and weekly-grid workflow | Deferred | Requires the migration and representative academic/assignment data in Supabase. |

Local static verification is recorded in the implementation handoff after lint and production build complete.
