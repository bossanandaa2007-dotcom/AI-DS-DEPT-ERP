# Supabase setup (Phase 10A–10C)

Apply migrations in filename order. From the repository root, link only after selecting the intended Supabase project:

```powershell
supabase link --project-ref <project-ref>
supabase db push
```

Run the reference-only seed only after migrations are applied. It creates no `auth.users`, profiles, passwords, or secrets.

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
