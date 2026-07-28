# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-pages.spec.ts >> faculty visible pages render
- Location: e2e\role-pages.spec.ts:13:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /^.+\/faculty(?:\/|$)/
Received string:  "http://127.0.0.1:5173/login"
Timeout: 10000ms

Call log:
  - Expect "toHaveURL" with timeout 10000ms
    23 × unexpected value "http://127.0.0.1:5173/login"

```

```yaml
- main:
  - text: KCG CT
  - heading "KCG College of Technology ERP" [level=1]
  - paragraph: AI&DS Department ERP System — sign in to continue to your assigned workspace.
  - heading "Staff Login" [level=2]
  - paragraph: HOD, faculty, lab assistants and system administrators can sign in here.
  - text: User ID or Admin Email
  - textbox "User ID or Admin Email":
    - /placeholder: Enter your User ID or Admin Email
    - text: faculty1@vernex.in
  - text: Password
  - textbox "Password"
  - button "Show password"
  - checkbox "Remember me"
  - text: Remember me
  - alert: Invalid email or password.
  - button "Sign In"
  - button "Student?Use student login"
  - paragraph: Department of Artificial Intelligence and Data Science
```

# Test source

```ts
  1  | import { expect, type Page } from '@playwright/test'
  2  | 
  3  | export type TestRole = 'super_admin' | 'hod' | 'faculty' | 'lab_assistant' | 'student'
  4  | export type TestAccount = { email: string; role: TestRole; route: string; portal: 'staff' | 'student'; password: () => string }
  5  | 
  6  | const required = (name: 'E2E_USER_PASSWORD' | 'E2E_ADMIN_PASSWORD') => {
  7  |   const value = process.env[name]
  8  |   if (!value) throw new Error(`${name} is unavailable.`)
  9  |   return value
  10 | }
  11 | 
  12 | export const accounts: TestAccount[] = [
  13 |   { email: 'admin@vernex.in', role: 'super_admin', route: '/super-admin', portal: 'staff', password: () => required('E2E_ADMIN_PASSWORD') },
  14 |   { email: 'hod@vernex.in', role: 'hod', route: '/hod', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  15 |   { email: 'faculty1@vernex.in', role: 'faculty', route: '/faculty', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  16 |   { email: 'faculty2@vernex.in', role: 'faculty', route: '/faculty', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  17 |   { email: 'jury@vernex.in', role: 'faculty', route: '/faculty', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  18 |   { email: 'lab@vernex.in', role: 'lab_assistant', route: '/lab-assistant', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  19 |   ...[1, 2, 3, 4, 5].map((number): TestAccount => ({ email: `student${number}@vernex.in`, role: 'student', route: '/student', portal: 'student', password: () => required('E2E_USER_PASSWORD') })),
  20 | ]
  21 | 
  22 | export async function login(page: Page, account: TestAccount) {
  23 |   await page.goto('/login')
  24 |   if (account.portal === 'student') await page.getByRole('button', { name: /Student.*student login/i }).click()
  25 |   await page.getByLabel('User ID or Admin Email').fill(account.email)
  26 |   const passwordInput = page.locator('#login-password')
  27 |   await passwordInput.fill(account.password())
  28 |   await page.getByRole('button', { name: 'Sign In' }).click()
  29 |   await passwordInput.fill('')
> 30 |   await expect(page).toHaveURL(new RegExp(`^.+${account.route}(?:/|$)`))
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  31 | }
  32 | 
  33 | export async function logout(page: Page) {
  34 |   await page.getByRole('button', { name: 'Log out' }).click()
  35 |   await expect(page).toHaveURL(/\/login$/)
  36 | }
  37 | 
```