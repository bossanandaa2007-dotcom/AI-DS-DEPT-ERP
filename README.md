# AI&DS Department ERP

Department ERP for the Artificial Intelligence & Data Science department at KCG College of
Technology. React + Vite frontend backed by a live Supabase database, with five roles —
Super Admin, HOD, Faculty, Lab Assistant and Student — separated by Postgres row-level security.

---

## Running it

### 1. Install Node.js

You need **Node.js 20 or newer**. Check with:

```bash
node -v
```

If it prints nothing or a version below 20, install the LTS build from <https://nodejs.org>.
This is the only thing you have to install.

### 2. Start the app

From **this folder** (the one containing this README):

```bash
npm run dev
```

Then open <http://localhost:5173>.

Dependencies are already bundled in `node_modules`, so there is normally nothing to install.
Press `Ctrl+C` in the terminal to stop the server.

### If `npm run dev` fails

The bundled `node_modules` contains a native binary built for **Windows x64**. On macOS, Linux,
or an ARM machine, run this once and then start again:

```bash
cd frontend
npm install
cd ..
npm run dev
```

That takes a couple of minutes and needs an internet connection. Everything else is identical.

---

## Signing in

The app talks to a live Supabase project — the credentials are already in `frontend/.env.local`,
so there is nothing to configure. All demo accounts use the password **`demo123`**.

| Role | Email | Lands on |
| --- | --- | --- |
| Super Admin | `admin@vernex.in` | `/super-admin` |
| HOD | `hod@vernex.in` | `/hod` |
| Faculty | `faculty1@vernex.in` | `/faculty` |
| Faculty | `faculty2@vernex.in` | `/faculty` |
| Faculty (jury) | `jury@vernex.in` | `/faculty` |
| Lab Assistant | `lab@vernex.in` | `/lab-assistant` |
| Student | `student1@vernex.in` … `student5@vernex.in` | `/student` |

Students sign in through the **"Student? Use student login"** link on the login page; everyone
else uses the staff form.

---

## A suggested demo route

Roughly ten minutes, showing that each role sees only what it should.

**1. Super Admin — `admin@vernex.in`**

- *Academic Setup* — the department, academic year, semesters, sections and subjects.
- *Subject Allocation* — pick a section; every subject shows who teaches it, and anything
  unallocated is flagged. Deactivated allocations can be reactivated from **All allocations**.
- *Timetable* — pick a section and the week appears as a grid. Click any empty slot to schedule
  it; times and room are prefilled from the ladder the section already uses. **Copy a day**
  duplicates a whole day's periods.
- *Assessments* — create an exam and assign it to the faculty member who teaches the subject.

**2. Faculty — `faculty2@vernex.in`**

- *Attendance* — the day's periods appear as cards. **Start attendance** opens the roster with
  everyone marked present; change only the absentees and press **Submit**. Nothing is written
  until you submit, and the page never reloads under you.
- *Marks* — open an assessment the admin created and enter marks.
- Note there is no "create assessment" button; that is the admin's job.

**3. Student — `student1@vernex.in`**

- *Attendance* — overall and month-by-month percentages, a subject-wise breakdown, and the
  detailed history. Students cannot mark their own attendance.
- *Marks*, *Requests*, *Complaints*.

**4. HOD — `hod@vernex.in`**

- *Dashboard* and *Attendance* — department-wide totals across every section, subject and
  student, with the lowest attendance listed first.
- *Reports* and *Audit* for the operational trail.

---

## What's in the folder

```
frontend/          React + Vite application
  src/app/         routing and providers
  src/modules/     one folder per feature (attendance, marks, timetable, …)
  src/services/    Supabase data access
  src/components/  shared UI
supabase/          SQL migrations, RLS policies and seed data
docs/              project status and workflow audit
```

Useful commands, all run from this folder:

```bash
npm run dev       # start the dev server
npm run build     # production build (type-checks first)
npm run lint      # ESLint
npm run preview   # serve the production build
```

---

## Notes

- **The data is live.** Every screen reads and writes a real Supabase database — there is no mock
  mode. Anything changed during the demo persists, and an internet connection is required.
- **Access is enforced in the database,** not just the UI. Row-level security decides what each
  role can read and write, so signing in as a student genuinely cannot reach another student's records.
- **User accounts cannot be created in the app.** Adding faculty or students is done through
  Supabase; the Users page edits existing profiles only.
- `frontend/.env.local` holds the Supabase URL and the browser publishable key. That key is
  designed to be public and is safe in the client, but the demo passwords are deliberately weak —
  don't publish this folder anywhere open.
