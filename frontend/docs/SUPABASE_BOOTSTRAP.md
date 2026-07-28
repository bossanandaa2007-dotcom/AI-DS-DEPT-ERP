# Supabase production provisioning

1. In Supabase Dashboard, open **Authentication > Providers > Email** and disable public sign-up.
2. Configure the same non-secret Auth email domain in `VITE_AUTH_EMAIL_DOMAIN` (frontend) and `AUTH_EMAIL_DOMAIN` (Edge Function). The ERP converts a User ID into `<lowercase-user-id>@<domain>` internally.
3. Create the first authorised user in **Authentication > Users** with that internal email. Do not insert directly into `auth.users` from SQL, the browser, seed files, or migrations.
4. The Auth trigger creates an inactive `public.profiles` row. In a privileged SQL session, set its `employee_or_register_number`, `date_of_birth`, `department_id`, `role = 'super_admin'`, and `status = 'active'`. Set the Auth password to the DOB in `DDMMYYYY` format.
5. Deploy the database migrations and the provisioning function. From the repository root, authenticate the Supabase CLI, set the Edge Function's server-only email-domain secret, then deploy the function:

   ```powershell
   npx supabase login
   npx supabase db push --project-ref <your-project-ref>
   npx supabase secrets set AUTH_EMAIL_DOMAIN=login.vernex.in --project-ref <your-project-ref>
   npx supabase functions deploy admin-create-user --project-ref <your-project-ref>
   ```

   Replace `login.vernex.in` only if it differs from `VITE_AUTH_EMAIL_DOMAIN`. `AUTH_EMAIL_DOMAIN` must never be added to a Vite `.env` file. Confirm the function appears in **Supabase Dashboard > Edge Functions** before provisioning users.
6. Sign in through the ERP login page using the User ID / Register Number and confirm the Super Admin redirect.
7. Configure academic data before provisioning student accounts that require enrollment.
8. After every production migration, regenerate `frontend/src/types/database.types.ts` from the linked database and rerun type checking, lint, tests, and the production build.

The browser uses only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the non-secret `VITE_AUTH_EMAIL_DOMAIN`. Never expose service-role keys, database passwords, or JWT secrets in Vite variables. `SUPABASE_SERVICE_ROLE_KEY` is read only inside the deployed Edge Function.
