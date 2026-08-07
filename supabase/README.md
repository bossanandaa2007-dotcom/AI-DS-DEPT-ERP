# Supabase setup

Apply migrations in filename order. From the repository root, link only after selecting the intended Supabase project:

```powershell
supabase link --project-ref <project-ref>
supabase db push
```

There is no seed file. The pilot's real data is loaded by the scripts in
[`pilot/`](pilot/README.md); the old `seed.sql` was removed because it inserted demo subjects
under department code `AI-DS` while the live department is `AI&DS`, so running it would have
added a phantom department or failed on the unique `departments.name`.

## Migration set

All twelve migrations are required. `202607160101`–`202607160106` build the schema, workflows,
RLS, storage and the document-review foundation. `107`–`110` repair a deployed database that had
drifted away from them. `111`–`112` are pilot changes.

They cannot be squashed into a single baseline today: the deployed database carries tables,
columns and constraints that **no migration here creates** (see *Known schema drift* below, plus
`faculty_assignments_one_primary_subject_faculty` and the `audit_logs` append-only trigger, both
found by hitting them at runtime). A consolidated baseline built from these files alone would not
reproduce the working database. Squash only after dumping the live schema:

```bash
supabase db dump --schema public > baseline.sql   # needs the database password
```

| Migration | Purpose |
| --- | --- |
| `202607160107_assessment_creation_roles` | Splits the permissive `assessments_write` FOR ALL policy so only Super Admin and HOD may create or delete assessments. Faculty keep UPDATE, which mark entry needs for the status roll-up. |
| `202607160108_restore_timetable_grants` | `timetable_entries` had lost INSERT/UPDATE/DELETE for `authenticated`, so every timetable write failed with `42501` before RLS was consulted. Also re-asserts the schema-wide baseline and sets default privileges. |
| `202607160109_neutralise_schema_drift` | Drops the `faculty_teaching_scopes` trigger that blocked all subject allocation, and defaults the drifted NOT NULL columns. |
| `202607160110_repair_attendance_record_guard` | A drifted trigger read `OLD.locked`, a column that does not exist, so UPDATE and DELETE on `attendance_records` failed with `42703` for everyone — attendance could be submitted once and never corrected. Restores the intended guard and adds the missing DELETE policy on `attendance_sessions`. |

| `202608060111_students_read_department_staff` | `profiles_select` let a student read only their own row, so the student timetable showed "Unassigned" on all 35 periods instead of naming the faculty. Adds one clause: a student may read the teaching staff of their own department. Student-to-student visibility is unchanged. |
| `202608060112_floor_duties` | Adds `public.floor_duties`. The roster had no table, so it was posted as one announcement listing all fifteen slots; now each person is shown only their own duty. |

Every statement in `109` and `110` is guarded, so both are idempotent and a no-op on a clean
database built from `101`–`106` alone.

## Known schema drift

The deployed database contains an unmigrated timetable/allocation feature that no migration here
creates:

- tables `faculty_teaching_scopes` and `timetable_periods`
- `faculty_assignments` — `effective_from` (NOT NULL), `effective_to`, `weekly_hours`, `is_jury_eligible`
- `timetable_entries` — `academic_year_id`, `department_id`, `semester_id`, `timetable_period_id`,
  `allocation_id`, `effective_from`, `effective_to`, `is_active`
- `subjects` — `subject_type`, `weekly_hours`, `is_active`, `study_year`
- `sections` — `batch`, `is_active`; `profiles` — `date_of_birth`, `employment_type`, `joining_date`

Migrations `109` and `110` stop this blocking the application but deliberately leave the tables and
columns in place. `frontend/src/types/database.types.ts` predates all of it, and
`frontend/src/services/supabase/academicRepository.ts` compensates with narrow casts that are
marked with comments. Before building on any of it, regenerate the types and reconcile the schema:

```bash
npx supabase gen types typescript --project-id <project-ref> --schema public \
  > frontend/src/types/database.types.ts
```

The `unique (section_id, day_of_week, period)` slot key defined in `202607160101` is also missing
from the deployed `timetable_entries`, so the database will accept two periods in the same slot.
The application guards this in `academicRepository.validateTimetableConflicts`, so the UI is safe,
but a direct write is not.

## Pilot data

The department's real odd-semester 2026-27 data is loaded by the scripts in
[`supabase/pilot/`](pilot/README.md), which replaced the demo data the project was built
against. Those scripts also document every point where the source documents disagreed and
what was decided. They require `supabase/.env.ops` (gitignored) holding a service-role key.

Sign-in takes a **User ID** rather than an email — a student's register number or a staff ID
such as `divya_aids`. The browser appends `AUTH_EMAIL_DOMAIN` from
`frontend/src/constants/auth.ts` to build the address Supabase Auth expects. It is a fixed
routing domain held in source, not an environment variable, so sign-in cannot break because a
variable was missed in a new environment. Changing it would orphan every existing account.

## First Super Admin bootstrap

1. In Supabase Dashboard → Authentication → Users, create the first user manually (or invite them) with their real email.
2. Confirm the user, then in SQL Editor run the following with that user UUID:

```sql
update public.profiles
set role = 'super_admin', status = 'active'
where id = '<auth-user-uuid>';
```

3. Set the department ID and any staff profile records as required. Do not insert directly into `auth.users` from a migration.

## Disable public signup

In Supabase Dashboard → Authentication → Providers → Email, disable **Allow new users to sign up**. Keep the `enable_signup = false` local config aligned with that Dashboard setting.

## Rollback cautions

Review migrations against a disposable project first. `supabase db push` changes a remote database and should not be treated as reversible; use a new forward migration for fixes. Do not drop tables or reset a linked project without an approved backup and explicit authorization.

The frontend requires only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never place service-role, database, JWT, or other secret keys in Vite variables.

## Private document storage

Migration `202607160104_clean_storage.sql` creates private buckets for leave, gate-pass, OD, complaint, and announcement documents. The browser client uses only structured object paths, validates PDF/JPG/JPEG/PNG files to 3 MB, and requests short-lived signed URLs. Apply this migration with the normal migration order; do not make these buckets public.
