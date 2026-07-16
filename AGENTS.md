# AI&DS Department ERP — Agent Instructions

## Project

Build a frontend-first AI&DS Department ERP for a 45-day college pilot.

## Roles

- Super Admin
- HOD
- Faculty
- Lab Assistant
- Student

## Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- React Hook Form
- Zod
- Lucide React

## Development Rules

- Follow a modular feature-based architecture.
- Keep all code TypeScript strict-mode compatible.
- Frontend mock data must be used before Supabase integration.
- Do not connect Supabase unless a later phase explicitly requests it.
- Keep service interfaces replaceable with Supabase implementations.
- Centralize roles, permissions and route paths.
- Do not scatter hardcoded role checks across components.
- Reuse components instead of duplicating layouts or patterns.
- Maintain one consistent design system.
- Support desktop, tablet and mobile.
- Include loading, empty, error and success states in later modules.
- Do not install unnecessary dependencies.
- Do not delete working functionality without justification.
- Do not commit secrets or environment values.
- Run lint and production build after every major phase.
- Fix all TypeScript, lint and build errors before stopping.
- Report files created, files modified, commands executed and remaining work.
