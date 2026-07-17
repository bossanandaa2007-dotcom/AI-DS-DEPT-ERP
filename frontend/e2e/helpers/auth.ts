import { expect, type Page } from '@playwright/test'

export type TestRole = 'super_admin' | 'hod' | 'faculty' | 'lab_assistant' | 'student'
export type TestAccount = { email: string; role: TestRole; route: string; portal: 'staff' | 'student'; password: () => string }

const required = (name: 'E2E_USER_PASSWORD' | 'E2E_ADMIN_PASSWORD') => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is unavailable.`)
  return value
}

export const accounts: TestAccount[] = [
  { email: 'admin@vernex.in', role: 'super_admin', route: '/super-admin', portal: 'staff', password: () => required('E2E_ADMIN_PASSWORD') },
  { email: 'hod@vernex.in', role: 'hod', route: '/hod', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  { email: 'faculty1@vernex.in', role: 'faculty', route: '/faculty', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  { email: 'faculty2@vernex.in', role: 'faculty', route: '/faculty', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  { email: 'jury@vernex.in', role: 'faculty', route: '/faculty', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  { email: 'lab@vernex.in', role: 'lab_assistant', route: '/lab-assistant', portal: 'staff', password: () => required('E2E_USER_PASSWORD') },
  ...[1, 2, 3, 4, 5].map((number): TestAccount => ({ email: `student${number}@vernex.in`, role: 'student', route: '/student', portal: 'student', password: () => required('E2E_USER_PASSWORD') })),
]

export async function login(page: Page, account: TestAccount) {
  await page.goto('/login')
  if (account.portal === 'student') await page.getByRole('button', { name: /Student.*student login/i }).click()
  await page.locator('#login-email').fill(account.email)
  const passwordInput = page.locator('#login-password')
  await passwordInput.fill(account.password())
  await page.getByRole('button', { name: 'Sign In' }).click()
  await passwordInput.fill('')
  await expect(page).toHaveURL(new RegExp(`^.+${account.route}(?:/|$)`))
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}
