# AI&DS Department ERP — frontend

React frontend for the AI & Data Science Department ERP, backed by Supabase with browser-safe
environment variables.

> **Just want to run it?** See the [README in the parent folder](../README.md). Everything below
> is for working on the code.

## Roles

Super Admin · HOD · Faculty · Lab Assistant · Student

Route access is centralised in `src/app/router/route-config.tsx`, and the navigation each role
sees comes from `src/constants/navigation.ts`. Authorisation is ultimately enforced by Postgres
row-level security, not by the UI.

## Technology

- React 19 + Vite 8
- TypeScript (strict mode)
- Tailwind CSS
- React Router 7
- React Hook Form + Zod
- Lucide React
- `@supabase/supabase-js`

## Setup

```bash
npm install
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
npm run dev
```

Set only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_DATA_PROVIDER=supabase`
in `.env.local`. Never put service-role keys, database passwords, JWT secrets or CLI tokens in
Vite variables — everything prefixed `VITE_` is shipped to the browser.

## Commands

```bash
npm run dev       # dev server on http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # serve the production build
```

## Architecture

- `src/app` — application composition, providers, centralised routing.
- `src/components` and `src/layouts` — reusable UI primitives and page shells.
- `src/modules` — one folder per ERP domain (attendance, marks, timetable, academics, …).
- `src/services/supabase` — RLS-aware repositories; the only place that talks to the database.
- `src/hooks` — loading boundaries, chiefly `useAsyncResource`.
- `src/lib` — framework-free helpers (dates, audit metadata formatting, the Supabase client).
- `src/types` and `src/constants` — shared contracts, roles, permissions, route paths.
- `src/styles/globals.css` — design tokens and global base styles.

## Conventions worth knowing

- **Data access goes through a repository.** Pages never call `supabase` directly; they call a
  function in `src/services/supabase` so validation and error mapping stay in one place.
- **One data load per page.** A page owns a single `useAsyncResource` and passes `data` and
  `reload` down to its panels. Two hooks on one page means two full round trips and panels that
  disagree with each other.
- **Background reloads must not unmount the tree.** Guard on `isLoading && !data`, otherwise an
  in-progress form is destroyed every time something refreshes.
- **Overriding padding on `Input` or `Button` needs `pl-*`/`pr-*`, not `px-*`.** Tailwind sorts a
  utility family as strings, so `.px-12` is emitted before `.px-3` and the component's own `px-3`
  would win. See the comment in `src/components/ui/Input.tsx`.

## Data provider

Supabase only. Failed requests surface their real error state; there is no mock or localStorage
fallback, so the app requires network access and a configured `.env.local` to do anything.

## Known drift

The deployed database carries tables and columns that no committed migration creates
(`faculty_teaching_scopes`, `timetable_periods`, `effective_from`/`effective_to`, and others), and
`src/types/database.types.ts` predates them. `src/services/supabase/academicRepository.ts`
compensates with narrow casts, each marked with a comment. Regenerate the types and reconcile the
schema before building on those tables:

```bash
npx supabase gen types typescript --project-id <project-ref> --schema public \
  > src/types/database.types.ts
```
