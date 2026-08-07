# AI&DS pilot data load

Loads the department's real odd-semester 2026-27 data into the deployed Supabase project,
replacing the demo data the pilot was built against.

## Source documents

All four live in `supabase/pilot/source-documents/` and are the only inputs. That folder is
gitignored because the name list carries the full student roster. They are needed only to
regenerate `pilot-data.json` — the loaders themselves read the JSON, and the data is already in
the database.

| File | Provides |
| --- | --- |
| `AI & DS - Timetable Final (1).xlsx` | Class timetables for II-A, II-B, III, IV, the John McCarthy lab occupancy grid, and the per-section course/faculty tables |
| `Overall Name List (1).xlsx` | 219 students with register numbers, by year and section |
| `Workload_ODD_26-27_V4 (1).doc` | Faculty roster, designations, subject allocation, contact hours and departmental responsibilities |
| `Floor Duty 2026-27.docx` | Floor duty roster, 5 days x 3 shifts |

## Scripts

Run from the repository root, in order. All read `supabase/.env.ops`, which must define
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. That file is gitignored and its key must
**never** be given a `VITE_` prefix — Vite inlines those into the browser bundle.

```bash
python supabase/pilot/build-dataset.py   # documents  -> pilot-data.json
node supabase/pilot/0-backup.mjs         # full dump of current state -> out/backup-*.json
node supabase/pilot/1-audit.mjs          # read-only report           -> out/audit.md
node supabase/pilot/2-purge.mjs          # dry run: prints what it would delete
node supabase/pilot/2-purge.mjs --confirm
node supabase/pilot/3-load.mjs           # loads everything           -> out/credentials.csv
node supabase/pilot/4-verify.mjs         # checks the result          -> out/verification.md
```

`3-load.mjs` is safe to re-run: every step matches on a natural key first, so a run that
fails partway can simply be repeated. `4-verify.mjs` exits non-zero if any check fails.

`pilot-data.json` and everything in `out/` are gitignored — they hold the student roster and
the credential sheet.

## What was loaded

| Records | Count |
| --- | ---: |
| Sections (II-A, II-B, III-A, IV-A) | 4 |
| Semesters (3, 5, 7) | 3 |
| Subjects | 27 |
| Faculty accounts (8 department + 7 visiting) | 15 |
| Student accounts | 218 |
| Enrollments | 218 |
| Faculty allocations | 45 |
| Timetable entries | 148 |
| Floor duty announcement | 1 |

## Sign-in

Sign-in takes a **User ID**, not an email; `frontend/src/lib/auth.ts` appends
`AUTH_EMAIL_DOMAIN` from `frontend/src/constants/auth.ts` internally. That constant must stay
in step with `EMAIL_DOMAIN` in `build-dataset.py`, which is what the accounts were created
with.

| Role | User ID | Initial password |
| --- | --- | --- |
| Student | register number, e.g. `9124243011` | last 4 digits, e.g. `3011` |
| Staff | `<name>_aids`, e.g. `divya_aids` | `<name>@aids`, e.g. `divya@aids` |

Passwords are never stored in any repository file — both are derived in `lib.mjs`.
`out/credentials.csv` is generated at load time for handover and is gitignored.

> Student passwords are four digits and are derived from a number their classmates can see.
> That is acceptable for a closed 45-day pilot, but a password change flow is required before
> this system is used for anything of record.

## Decisions taken where the documents disagreed

| Point | Sources | Resolution |
| --- | --- | --- |
| III year class advisor | Timetable header says Ms. Kanchana; workload says Ms. T Sri Devi is "In charge: III Year Class" | Ms. T Sri Devi. Ms. Kanchana appears in no other document. |
| 23CB311 lab faculty for II-A | Class sheet says Krithikaa/Ramani, workload agrees (2h + 1h); lab sheet says Dr. Aida Jones | Followed the workload. Ms. Ramani is stored as co-faculty. |
| `23AD503` on the lab sheet | Class timetable and workload both say `23AD053` (Computer Vision) | Normalised to `23AD053`. |
| "Dr. Aishwarya" vs "Ms. Aishwarya" | Both spellings appear in the II-B sheet, on different rows | Treated as two different people. **Needs HOD confirmation.** |
| Register number `9123243001` | Used by both Abdul Rahamankhan p and Mohd Sohyal | Abdul Rahamankhan p keeps it; Mohd Sohyal has no account yet. |

## Open items

0. **Pending migration: `202608060111_students_read_department_staff.sql`.** Until it is applied,
   students cannot read any profile but their own, so the faculty name is blank on every period
   of the student timetable. Apply it in Supabase Studio → SQL Editor, then confirm with
   `node supabase/pilot/5-verify-student-visibility.mjs` (expects 15 staff visible, 0 other
   students, 35/35 periods nameable).
1. **Mohd Sohyal (IV year) has no account.** His register number duplicates Abdul
   Rahamankhan p's. Supply the correct number, add him to the name list, and re-run
   `build-dataset.py` then `3-load.mjs`.
2. **Confirm "Dr. Aishwarya"** teaches II-B Communication Skill and is not Ms. S Aishwarya.
   If they are the same person, delete the `draishwarya_aids` account and re-point the
   allocation.
3. **Room numbers are placeholders** — `AI&DS II-A`, `AI&DS III-A` and so on. The source
   timetables name no classroom. Only the lab is real (`JOHN Mc CARTHY`). Supply real room
   numbers and they can be updated in bulk.
4. **Faculty employee IDs are blank.** No source document lists them.
5. **No lab assistant exists.** The ERP has a `lab_assistant` role and the lab timetable has
   `lab_assistant_id` on every entry, but no document names one.
6. **`COMM-SKILL` is a local placeholder code** for the placement Communication Skill class,
   which carries no course code and no credits in the timetable.
7. **First-year data was not supplied.** The workload allocates `23AD101` and `23AD121` to
   I-year A and B sections, but there is no I-year name list or timetable, so no I-year
   section, subject or account was created.
8. **Three demo accounts could not be deleted** — `faculty1@`, `faculty2@` and `hod@vernex.in`
   appear as `audit_logs.actor_id`, the foreign key is `ON DELETE SET NULL`, and `audit_logs`
   carries an append-only trigger that rejects the resulting update. They are banned in Auth
   and set to `inactive`, so they cannot sign in. 18 demo audit rows also remain, for the same
   reason.
9. **`admin@vernex.in` was kept** as the only super admin and renamed to "AI&DS ERP
   Administrator". Rename or replace it from User management.
10. **Batch-split periods store two rows in one slot.** II-A and II-B each run 23CB311 for one
    batch while the other is in 23AD311, four periods a week. The deployed
    `timetable_entries` has no `unique (section_id, day_of_week, period)` index, so both rows
    are stored and the timetable grid renders both under a "Batch split" label. Adding that
    index later would break these eight rows.
