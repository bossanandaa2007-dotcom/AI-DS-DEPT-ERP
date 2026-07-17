# AI&DS Department ERP — Production Audit Report

Audit date: 2026-07-17 (Asia/Kolkata)

## 1. Executive result

**PASS WITH LIMITATIONS.** The application compiles cleanly, uses authenticated Supabase repositories in production, has synchronized local/remote migrations through `202607170109`, and all configured authentication and route-access cases have pass evidence. Production security defects found during the audit were repaired with forward-only migrations. The application is not yet approved for production deployment because state-changing workflows were not all executed end-to-end, the complete browser suite did not finish in one uninterrupted green run due intermittent Supabase fetch failures, and remote database lint/type generation remain blocked by Supabase transport errors.

## 2. Repository and environment

- Repository root: `D:\AI-DS DEPT ERP`; frontend: `frontend`; Supabase: `supabase`.
- Branch: `main`; package manager: npm.
- Stack: React 19, React Router 7, Vite 8, TypeScript 6 strict mode, Tailwind 3, Supabase JS 2, Playwright 1.61.
- State management: React context/hooks and feature repositories; no separate global state library.
- Environment: browser-safe Supabase URL/publishable key expected in `.env.local`; examples contain placeholders; service-role credentials are not used by frontend code.
- Test configuration: Playwright Chromium, serial worker, credential values loaded from ignored `.env.e2e.local`; traces/screenshots/video disabled to prevent credential-bearing artifacts.

## 3. Baseline results

| Check | Command | Result | Evidence |
| ----- | ------- | ------ | -------- |
| Dependencies | `npm ci --ignore-scripts` | PASS after repair | Initial EPERM was caused by two running Vite processes; installation then completed with 233 packages. |
| Lint | `npm run lint` | PASS | ESLint exited 0. |
| TypeScript | `npx --no-install tsc -b --pretty false` | PASS | Exited 0. |
| Unit/integration tests | `npm run test --if-present` | NOT CONFIGURED | No unit/integration test script existed. |
| Production build | `npm run build` | PASS | Vite production bundle completed; large-chunk warning only. |
| Migration history | `npx supabase migration list --linked` | PASS | Local and remote matched through `107` at baseline. |
| Migration dry-run | `npx supabase db push --linked --dry-run` | PASS | Remote reported up to date. |
| Database lint | `npx supabase db lint --linked --level error --fail-on error` | BLOCKED | `LegacyDbConfigLoginRoleNetworkError / TransportError`. |
| Database types | `npx supabase gen types typescript --linked` | BLOCKED | Supabase type API returned `LegacyGenTypesNetworkError / TransportError`. Existing file preserved. |

## 4. Final verification results

| Check | Result | Remaining issue |
| ----- | ------ | --------------- |
| Lint | PASS | None. |
| TypeScript strict check | PASS | None. |
| Production build | PASS | 872 kB main chunk warning; code splitting is a performance improvement. |
| Authenticated Playwright | PARTIAL PASS | 16/18 passed in the full run; the two failed cases passed on focused reruns after one test-session fix. Intermittent Supabase `Failed to fetch` messages remain. |
| Migration synchronization | PASS | Local and remote match through `109`; dry-run says remote is up to date. |
| Database lint | BLOCKED | Linked login-role transport initialization fails intermittently. |
| Generated database types | BLOCKED | Remote type endpoint unavailable; snapshot is not certified synchronized with `108–109`. |
| Production mock/local storage scan | PASS | No runtime mock service, `localStorage`, `sessionStorage`, public URL, or service-role usage in `frontend/src`. |
| Production terminology scan | PASS WITH HISTORICAL EXCEPTIONS | Applied migration `107` and immutable earlier migration comments retain historical wording; no production UI/config dependency remains. |

## 5. Supabase migration status

| Migration | Local | Remote | Validation | Notes |
| --------- | ----- | ------ | ---------- | ----- |
| `101`–`106` | Yes | Yes | History matched | Core, workflows, RLS/RPC, storage, document review, correction repair. |
| `107` | Yes | Yes | Applied before this phase | Student daily check-in RPC foundation. |
| `108_production_security_hardening` | Yes | Yes | Transactionally applied | Time window, department scope, messaging, audit, corrections, Storage audience access, Notifications access retirement. |
| `109_project_rls_recursion_fix` | Yes | Yes | Transactionally applied and route retested | Removes `projects`/`project_members` policy recursion seen as PostgreSQL `42P17`. |

- Schema drift: no migration-history drift; current remote schema introspection was limited by the database-lint transport failure.
- Tables affected: `messages`, `audit_logs`, `requests`, `request_history`, `mark_corrections`, `marks`, `attendance_records`, `attachments`, `notifications`, `projects`, `project_members`, and `storage.objects` through policies/RPCs.
- Functions added/replaced: `can_send_direct_message`, `can_review_request`, `transition_request_status`, `approve_mark_correction`, `student_daily_check_in`, `is_project_member`, and `can_manage_project`.
- Policies changed: Direct Messages, audit logs, requests/history, attachments/private Storage, Notifications, projects, and project members.
- Storage: private buckets remain private; announcement recipients can read only attachments for announcements they can access.
- Type generation: attempted repeatedly and blocked by the Supabase type API. The existing non-empty `Database` snapshot is retained and must be regenerated when the endpoint recovers.

## 6. Role readiness matrix

| Role | Login | Dashboard | Authorized workflows | Unauthorized-access tests | Result |
| ---- | ----- | --------- | -------------------- | ------------------------- | ------ |
| Super Admin | Passed | Rendered | Routes rendered; mutations not exhaustively executed | Student route denied | Partial pass |
| HOD | Passed | Rendered | Department routes rendered; approvals statically scoped | Super Admin route denied | Partial pass |
| Faculty | Passed (three accounts, Jury capability included) | Rendered | Faculty routes and Jury eligibility rendered | Super Admin/Jury capability denial passed | Partial pass |
| Lab Assistant | Passed | Rendered | Lab timetable, attendance, leave, announcements rendered | Super Admin route denied | Partial pass |
| Student | Passed (five accounts) | Rendered | Student routes rendered | Super Admin route and wrong portal denied | Partial pass |

## 7. Module readiness matrix

| Module | Frontend route | Supabase integration | RLS | RPC/transaction | Workflow test | Result |
| ------ | -------------- | -------------------- | --- | --------------- | ------------- | ------ |
| Authentication | `/login` | Live Auth/profile | Profile/route guards | Auth service | Lifecycle executed | Verified with network limitation |
| Users | `/super-admin/users` | Live | Role managed | Admin provisioning boundary | Route rendered | Partial |
| Academic setup | `/super-admin/academic-setup` | Live | Department scoped | Repository writes | Route rendered | Partial |
| Timetable | Role timetable routes | Live | Section/assignment scoped | Repository writes | Routes rendered | Partial |
| Attendance | Role attendance routes | Live | Section/teacher scoped | Finalize/correction/check-in RPCs | Routes rendered | Partial |
| Marks | Faculty/HOD/student marks | Live | Assessment/student scoped | Finalize/correction RPCs | Routes rendered | Partial |
| Leave | Role request routes | Live | Requester/reviewer scoped | Transition RPC | Routes rendered | Partial |
| Gate pass | Student/HOD requests | Live | Requester/reviewer scoped | Transition RPC | Routes rendered | Partial |
| Projects | Requests/projects routes | Live | Recursion repaired | Repository writes | Route retested | Partial |
| Competitions | HOD/student operations | Live | Department scoped | Repository writes | Routes rendered | Partial |
| OD | Student/faculty/HOD requests | Live | Assignment/department scoped | Transition RPC | Routes rendered | Partial |
| Document review | Assignment/status routes | Live | Owner/reviewer scoped | Review RPCs | Faculty/Jury routes rendered | Partial |
| Private files | Secure preview/upload controls | Live private Storage | Owner/reviewer/audience scoped | Signed URL and review RPCs | Route presence only | Partial |
| Portion completion | Faculty/HOD routes | Live | Teacher/section scoped | Repository writes | Routes rendered | Partial |
| Announcements | Role announcement routes | Live | Audience scoped | Repository writes | Routes rendered | Partial |
| Complaints | Student communication route | Live | Student/assignee/department | Repository writes | Route rendered | Partial |
| Direct Messages | Communication pages | Live | HOD↔Faculty, same department | Column-restricted updates | Static verification | Partial |
| Dashboards | Role roots | Live aggregates | Source-table RLS | Reporting repository | All roles rendered | Partial pass |
| Reports | HOD/Admin reports | Live aggregates | Department scope | Reporting repository | Routes rendered | Partial |
| Audit history | Admin/HOD audit | Live | Super Admin global; HOD department | Append-only producers | Routes rendered | Partial |

All 20 listed production modules are connected to Supabase at code level. Full readiness remains limited by mutation-test coverage.

## 8. Workflow test results

| Actor | Starting state | Action | Expected state | Actual state | Database evidence | UI evidence | Result |
| ----- | -------------- | ------ | -------------- | ------------ | ----------------- | ----------- | ------ |
| 11 configured users | Logged out | Login, refresh, deny route, logout, login again | Correct role session/redirect | Passed for every account across full/focused runs | Auth/profile reads succeeded | Correct route and unauthorized redirects | Verified |
| Student | Staff portal | Attempt login | Rejected | Alert displayed | Auth prevented by portal/profile rule | Alert assertion passed | Verified |
| Jury-eligible Faculty | Faculty session | Open Jury route | Allowed | Route rendered | Eligibility read succeeded | URL assertion passed | Verified |
| Non-Jury Faculty | Faculty session | Open Jury route | Denied | Unauthorized route | Eligibility read succeeded | URL assertion passed | Verified |
| Each role | Authenticated | Open configured dashboard/module routes | Main page renders | Role page groups passed | Live repository requests initiated | No router error; main visible | Partially verified |
| Student | Open daily session | Submit check-in 09:00–09:45 | One pending verification record | Not executed | RPC and constraints applied remotely | Route rendered only | Static only |
| Faculty/HOD | Draft attendance/marks | Finalize/correct | Locked record plus audit | Not executed | RPC/guard reviewed | Routes rendered only | Static only |
| Request actors | Submitted request | Approve/reject transitions | Scoped next state/history | Not executed | `transition_request_status` applied | Routes rendered only | Static only |
| Project managers | Existing project | Manage members | Authorized update without recursion | Read path retested | `109` applied | Project-bearing pages rendered | Partial |
| File actors | Private object | Upload/review/read | Only owner/reviewer/audience access | Not executed | Private policies/RPCs reviewed | Routes rendered only | Static only |
| Communication actors | Existing records | Announce/complain/message | Persisted scoped record | Not executed | Policies/repositories reviewed | Routes rendered only | Static only |

## 9. RLS and security results

| Resource | Role | Operation | Expected | Actual | Result |
| -------- | ---- | --------- | -------- | ------ | ------ |
| Protected routes | Wrong role | Navigate | Denied | `/unauthorized` | Verified |
| Jury route | Non-eligible Faculty | Navigate | Denied | `/unauthorized` | Verified |
| Profiles/role | Authenticated user | Load role | Server profile controls role | Correct redirects | Verified |
| Daily attendance | Student | Insert through RPC | Active enrollment, section/date/time, one record | Migration applied | Static verified |
| Requests/history | Faculty/HOD | Read/transition | Assignment and department scope | Migration applied | Static verified |
| Marks corrections | Faculty/HOD/Admin | Approve/reject | Teacher or scoped administrator | Migration applied | Static verified |
| Direct Messages | HOD/Faculty | Select/insert/update | Same-department opposite-role pair; only receipt metadata mutable | Migration applied | Static verified |
| Audit logs | HOD | Select | Own department actors only | Migration applied | Static verified |
| Announcement attachments | Authorized audience | Select object | Allowed through announcement audience | Migration applied | Static verified |
| Notifications legacy table | Authenticated | Any table operation | Denied | Policies removed and privileges revoked | Static verified |
| Projects/members | Member/guide/manager | Select/write | No recursive policy; scoped access | `42P17` repaired by `109` | Route-level verified |
| Anonymous | Any application table | CRUD | Denied | Grants revoked in security baseline | Static verified |

No service-role key, hardcoded UUID, public bucket URL, production local storage, or client-controlled role authority was found.

## 10. Mock and legacy cleanup

- Remaining mocks: none referenced by `frontend/src`; no production fallback exists.
- Remaining `localStorage`/`sessionStorage`: none in production source.
- Remaining hardcoded domain IDs: none found.
- Remaining production terminology: none in frontend UI/config/docs. Historical wording remains only in already-applied migration `107`/earlier comments and `AGENTS.md`; those were not rewritten.
- Remaining notification code: no production navigation, route, dashboard, counter, service, or workflow. The historical table remains to avoid deleting remote data; authenticated access is revoked. Its generated type and migration history remain non-runtime artifacts.
- Obsolete provisioning scripts and the stale earlier audit were removed. Generated Playwright failure artifacts were also removed; diagnostics recording was disabled to avoid credential-bearing artifacts.

## 11. Files changed

| File path | Purpose / important change | Associated test |
| --------- | -------------------------- | --------------- |
| `.gitignore` | Ignore local E2E credentials/artifacts | Git status inspection |
| `docs/PROJECT_STATUS_AND_WORKFLOW_AUDIT.md` | Removed stale report | Terminology scan |
| `frontend/.env.example` | Placeholder-only browser configuration | Build |
| `frontend/README.md` | Production wording and test command | Terminology scan |
| `frontend/docs/SUPABASE_BOOTSTRAP.md` | Production provisioning guidance | Terminology scan |
| `frontend/package.json`, `frontend/package-lock.json` | Playwright scripts/dependency | E2E suite |
| `frontend/playwright.config.ts` | Safe authenticated E2E configuration | Test discovery/runs |
| `frontend/e2e/auth.spec.ts` | Multi-account auth lifecycle | Playwright |
| `frontend/e2e/role-pages.spec.ts` | Role pages and Jury authorization | Playwright |
| `frontend/e2e/helpers/auth.ts` | Account/login/logout helpers | Playwright |
| `frontend/e2e/helpers/diagnostics.ts` | Secret-safe diagnostic collection | Playwright |
| `frontend/src/layouts/AppShell.tsx` | Auth/session shell corrections | E2E/build |
| `frontend/src/lib/supabase.ts` | Typed singleton/session settings | Type check/build |
| `frontend/src/modules/auth/AuthProvider.tsx` | Reliable session/profile lifecycle | Auth E2E |
| `frontend/src/modules/auth/LoginPage.tsx` | Portal-aware login behavior | Auth E2E |
| `frontend/src/modules/auth/RouteGuards.tsx` | Server-profile role protection | Unauthorized E2E |
| `frontend/src/modules/users/FacultyJuryEligibilityPanel.tsx` | Production terminology | Lint/build |
| `frontend/src/modules/users/UserManagementPage.tsx` | Production terminology | Lint/build |
| `frontend/src/services/supabase/academicRepository.ts` | Scoped live queries/operations | Type check/routes |
| `frontend/src/services/supabase/attendanceRepository.ts` | Daily check-in RPC integration | Type check/routes |
| `frontend/src/services/supabase/authService.ts` | Profile/session synchronization | Auth E2E |
| `frontend/src/services/supabase/departmentOperationsRepository.ts` | Department-scoped operations | Type check/routes |
| `frontend/src/services/supabase/marksRepository.ts` | Correction RPC alignment | Type check/routes |
| `frontend/src/services/supabase/query.ts` | Consistent Supabase errors | Lint/build |
| `frontend/src/services/supabase/reportingRepository.ts` | Role/department reporting context | Dashboard routes |
| `frontend/src/services/supabase/requestWorkflowRepository.ts` | Request transition alignment | Type check/routes |
| `frontend/src/types/database.types.ts` | Existing non-empty schema snapshot | Type check; regeneration blocked |
| `supabase/migrations/202607160107_pilot_runtime_fixes.sql` | Existing applied check-in foundation retained unchanged | Migration sync |
| `supabase/migrations/202607170108_production_security_hardening.sql` | Security/RPC/Storage hardening | Remote apply, auth/routes |
| `supabase/migrations/202607170109_project_rls_recursion_fix.sql` | Project policy recursion repair | Remote apply, route retest |

Removed untracked operational utilities: `scripts/bootstrap-pilot-data.mjs`, `scripts/create-pilot-admin.mjs`, `scripts/create-pilot-users.mjs`, and `scripts/verify-pilot-readiness.mjs`.

## 12. Exact remaining blockers

| Severity | Role | Route | Workflow | Root cause | Required fix | Type |
| -------- | ---- | ----- | -------- | ---------- | ------------ | ---- |
| P0 | All | Multiple | State-changing ERP workflows | Attendance, marks, requests, uploads, communication, projects, and reporting mutations were not all executed with database assertions | Run a controlled non-destructive UAT dataset through every transition and retain UI/database evidence | Validation |
| P1 | All | Multiple | Stable authenticated runtime | Intermittent Supabase `Failed to fetch` affected the long E2E run, though focused reruns passed | Verify network/DNS/TLS path and rerun all 18 cases in one clean run | Environment/external |
| P1 | Developers | N/A | Database contract | Supabase type endpoint returns transport errors | Regenerate `database.types.ts`, review diff, rerun checks | External dependency |
| P1 | Developers | N/A | Database lint | Linked login-role initialization returns transport errors; local Docker is unavailable | Restore endpoint access or Docker and run database lint | Environment/external |
| P1 | All | N/A | Regression coverage | No unit/integration test suite exists | Add repository/RPC contract and RLS negative tests | Code/test |

## 13. Production-readiness decision

**Not production-ready.** The code and applied database hardening are functionally ready for controlled authenticated validation, but deployment approval requires closing the P0 end-to-end mutation evidence gap and obtaining one stable full browser run. No known unpatched P0 security defect remains from this audit.

## 14. Recommended next actions

1. Run a controlled UAT dataset through every state-changing workflow and compare UI state with database history/audit rows.
2. Stabilize Supabase network access, then rerun all 18 Playwright cases once without interruption.
3. Run linked database lint and regenerate database types when the Supabase endpoints recover.
4. Add automated RLS negative tests and repository/RPC integration tests before deployment approval.
5. Code-split the main frontend bundle as a non-blocking performance improvement.
