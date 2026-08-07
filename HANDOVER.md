# AI&DS Department ERP — how to run and present this

Everything you need to start the application and demonstrate it to the department staff and HOD.

---

## Before the demo

**You need an internet connection.** This is not a self-contained demo. The application reads
live data from a hosted Supabase database — the department's real timetable, students and staff.
With no network, the login page appears but nothing loads. Test the connection in the room
beforehand if you can.

You need **Node.js 20 or newer**. Check with `node --version`; install from
<https://nodejs.org> if it is missing or older.

---

## Starting it

Open a terminal in this folder and run:

```bash
cd frontend
npm install      # once, takes a couple of minutes
npm run dev
```

Then open the URL it prints — usually <http://localhost:5173>.

**If `npm install` fails on the day**, a pre-built copy is included as a fallback:

```bash
cd frontend
npx serve dist
```

That serves the same application without installing anything, as long as `npx` can reach the
network. It is worth testing both paths the night before.

---

## Sign-in

Sign-in uses a **User ID**, not an email address.

| Role | User ID | Password |
| --- | --- | --- |
| Student | register number, e.g. `9124243011` | last 4 digits, e.g. `3011` |
| Staff | `<name>_aids`, e.g. `divya_aids` | `<name>@aids`, e.g. `divya@aids` |

### Accounts worth demonstrating

| Who | User ID | Password | Good for showing |
| --- | --- | --- | --- |
| Dr. M. Krishnamurthy (HOD) | `krishnamurthy_aids` | `krishnamurthy@aids` | Department dashboard, full timetable, faculty workload, audit trail |
| Ms. M. Divya (Faculty) | `divya_aids` | `divya@aids` | 19 weekly periods, 3 floor duty turns |
| Ms. V. S. Krithikaa Venket (Faculty) | `krithikaa_aids` | `krithikaa@aids` | Heaviest load, class teacher for II-A |
| Boss Anandaa S (III year) | `9124243011` | `3011` | Student timetable, own records only |
| Abisheak Roshan D (II-A) | `9125243001` | `3001` | A second student, different section |

Any of the 218 students works: the User ID is their register number and the password is its last
four digits.

---

## A demo that lands well

**1. The login page.** The campus photo, both logos, and the two sign-in modes.

**2. Sign in as the HOD** — `krishnamurthy_aids` / `krishnamurthy@aids`

- **Dashboard**: 218 active students, and a faculty workload list matching the department's own
  workload document — Krithikaa 24 periods, Ramani 17, Sri Devi 18.
- **Timetable**: pick *Year 2 · A*. It reproduces the department's timetable exactly, including
  the four batch-split periods where one half of the class is in 23CB311 and the other in
  23AD311. Lab periods show `JOHN Mc CARTHY`.
- **Subject Allocation**: 45 allocations across 27 subjects.
- **Audit**: every administrative action, with names rather than internal identifiers.

**3. Sign out, then sign in as Ms. Divya** — `divya_aids` / `divya@aids`

- **Timetable**: only *her* 19 periods, not the whole department. This is the point to make about
  role isolation — it is enforced by the database, not by hiding buttons.
- **Announcements**: "My floor duty" shows only her three turns, with today's highlighted.

**4. Sign out, then sign in as a student** — `9124243011` / `3011`

- **Timetable**: their own 35 periods for the week, in a grid, with each subject's faculty named.
- Everything else — attendance, marks — is scoped to that student alone.

The strongest point in the whole demo is that the same page shows three different things to three
people, and none of them can reach anyone else's data.

---

## Please do not

- **Delete or edit anything while signed in as the HOD or Super Admin.** Those accounts can
  remove timetable entries and change allocations, and this is the live pilot database that the
  department starts using next week. Treat the demo as read-only.
- **Share the credential list outside the department.** These are initial pilot passwords.

Attendance and marks screens are intentionally empty — no classes have been recorded yet. That is
expected, not a fault, and it is what the pilot will start filling in from next week.

---

## If something goes wrong

| Symptom | Cause and fix |
| --- | --- |
| Login page loads, but signing in hangs or errors | No internet, or the Supabase project is paused. Check the connection first. |
| "Invalid login credentials" | The User ID or password is wrong. Students: register number, then its last 4 digits. Staff: `name_aids` / `name@aids`. |
| Pages load but every list is empty | Signed in as a role with nothing assigned. Try the accounts in the table above. |
| `npm install` fails | Use the `npx serve dist` fallback above. |
| Port 5173 already in use | Vite will pick another port; use whichever URL it prints. |

---

## What is in this folder

| Path | What it is |
| --- | --- |
| `frontend/` | The application. React + TypeScript + Vite. |
| `frontend/dist/` | Pre-built copy, for the `npx serve dist` fallback. |
| `supabase/migrations/` | Database schema history. Reference only — do not run these. |
| `supabase/pilot/` | Scripts that loaded the department's data, plus a full record of how it was interpreted. They cannot run from this copy: the credentials they need were deliberately left out. |
| `docs/` | Current project status, verified behaviour, and known limitations. |

**Not included, on purpose:** the Supabase service-role key, the credential sheet for all 234
accounts, and the source documents containing the student roster. The application does not need
any of them to run.
