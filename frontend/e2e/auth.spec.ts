import { expect, test } from '@playwright/test'
import { accounts, login, logout } from './helpers/auth'
import { collectSafeDiagnostics } from './helpers/diagnostics'

for (const account of accounts) {
  test(`${account.email} authentication lifecycle`, async ({ page }, testInfo) => {
    const attachDiagnostics = collectSafeDiagnostics(page, testInfo)
    try {
      await login(page, account)
      await expect(page.getByText(account.role.replaceAll('_', ' '), { exact: false }).first()).toBeVisible()
      await page.reload()
      await expect(page).toHaveURL(new RegExp(account.route))
      const deniedRoute = account.role === 'super_admin' ? '/student' : '/super-admin'
      await page.goto(deniedRoute)
      await expect(page).toHaveURL(/\/unauthorized$/)
      await page.goto(account.route)
      await logout(page)
      await login(page, account)
    } finally { await attachDiagnostics() }
  })
}

test('wrong portals are rejected', async ({ page }) => {
  const student = accounts.find((account) => account.role === 'student')!
  await page.goto('/login')
  await page.locator('#login-email').fill(student.email)
  await page.locator('#login-password').fill(student.password())
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('alert')).toContainText('Student accounts must use the Student Login page.')
})
