# AI&DS Department ERP

Production-oriented React frontend for the AI & Data Science Department ERP, backed by Supabase with browser-safe environment variables.

## Planned roles

- Super Admin
- HOD
- Faculty
- Lab Assistant
- Student

## Technology stack

- React + Vite
- TypeScript (strict mode)
- Tailwind CSS
- React Router
- React Hook Form + Zod
- Lucide React

## Local setup

```bash
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_EMAIL_DOMAIN`, and `VITE_DATA_PROVIDER=supabase` in `.env.local`. Never put service-role keys, database passwords, JWT secrets, or CLI tokens in Vite variables.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test:e2e
npm run preview
```

## Architecture

- `src/app` contains application composition, providers, and centralized routing.
- `src/components` and `src/layouts` are reserved for reusable UI and page structures.
- `src/modules` contains feature-specific code, grouped by future ERP domain.
- `src/services/supabase` and `src/hooks` contain RLS-aware data access and loading boundaries.
- `src/types` and `src/constants` contain shared contracts, roles, permissions, and app configuration.
- `src/styles/globals.css` holds global base styles and the design-token foundation.

## Data provider

Production uses Supabase only. Failed Supabase requests surface their real error state; the application does not fall back to mock or localStorage data.
