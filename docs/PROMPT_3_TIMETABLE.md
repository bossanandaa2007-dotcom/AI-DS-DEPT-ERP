# Prompt 3 — Timetable workflow and conflict management

Migration `202607210112_timetable_grid_and_conflicts.sql` changes the timetable to a weekly, period-driven workflow. It adds reusable period and working-day configuration, effective-dated timetable entries, and protected mutation RPCs.

## Workflow

Academic year, department, semester, and section filters select the grid context. Configured working days form the rows and configured slots form the columns. Only teaching slots can receive entries; break, lunch, and non-teaching slots remain visible and read-only.

Faculty choices are derived from active, date-compatible subject allocations for the selected section. The entry dialog shows the faculty's current theory, practical, and total weekly timetable load and warns when the new entry exceeds its allocation's weekly hours.

## Security and history

- `save_timetable_entry` and `deactivate_timetable_entry` are the only browser mutation paths for entries.
- Super Admins manage all departments. HODs are checked against the section's department inside the RPC. Faculty, students, and Lab Assistants have role-scoped, read-only RLS views.
- Entries are effective dated. Section, faculty, room, laboratory, Lab Assistant, duplicate, and date-overlap checks are done atomically in the save RPC.
- An attendance-linked entry cannot be edited. Deactivation is a soft operation and preserves attendance history.
- Period and working-day settings are Super Admin-only and auditable through their configuration RPCs.

## Default working days

Global Monday through Saturday entries are seeded enabled. Sunday is seeded disabled and can be enabled by a Super Admin. Department-specific working days and periods are supported where a department needs an override.
