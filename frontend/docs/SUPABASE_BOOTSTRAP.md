# Supabase production provisioning

1. In Supabase Dashboard, open **Authentication > Providers > Email** and disable public sign-up.
2. Create the first authorised user in **Authentication > Users**. Do not insert directly into `auth.users` from SQL, the browser, seed files, or migrations.
3. The Auth trigger creates an inactive `public.profiles` row. In a privileged SQL session, set that profile's `department_id`, `role = 'super_admin'`, and `status = 'active'`.
4. Sign in through the ERP login page using the created email and confirm the user is redirected to the Super Admin dashboard.
5. Provision HOD, faculty, lab assistants, and students through an approved server-side/admin process, then configure academic data, enrollments, assignments, and timetable before workflow testing.
6. After every production migration, regenerate `frontend/src/types/database.types.ts` from the linked database and rerun type checking, lint, tests, and the production build.

The browser uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never expose service-role keys, database passwords, or JWT secrets in Vite variables.
