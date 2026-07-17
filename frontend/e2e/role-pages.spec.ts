import { expect, test } from '@playwright/test'
import { accounts, login, logout } from './helpers/auth'

const pages: Record<string, string[]> = {
  super_admin: ['', 'users', 'academic-setup', 'subject-allocation', 'timetable', 'attendance', 'announcements', 'document-review-assignments', 'audit', 'reports'],
  hod: ['', 'faculty-profiles', 'academic-setup', 'subject-allocation', 'timetable', 'attendance', 'marks', 'requests', 'portion-progress', 'announcements', 'document-review-assignments', 'audit', 'reports'],
  faculty: ['', 'timetable', 'attendance', 'marks', 'requests', 'portion-completion', 'document-reviews', 'announcements'],
  lab_assistant: ['', 'lab-timetable', 'attendance', 'leave', 'announcements'],
  student: ['', 'timetable', 'attendance', 'marks', 'requests', 'projects-and-od', 'document-status', 'announcements', 'complaints'],
}

for (const role of ['super_admin', 'hod', 'faculty', 'lab_assistant', 'student'] as const) {
  test(`${role} visible pages render`, async ({ page }) => {
    const account = accounts.find((candidate) => candidate.role === role)!
    await login(page, account)
    for (const segment of pages[role]) {
      await page.goto(`${account.route}${segment ? `/${segment}` : ''}`)
      await expect(page.locator('body')).not.toContainText(/Page not found|Unexpected Application Error/i)
      await expect(page.locator('main')).toBeVisible()
    }
  })
}

test('jury eligibility controls jury route', async ({ page }) => {
  const jury = accounts.find((account) => account.email === 'jury@vernex.in')!
  await login(page, jury)
  await page.goto('/faculty/jury-reviews')
  await expect(page).toHaveURL(/\/faculty\/jury-reviews$/)
  const faculty = accounts.find((account) => account.email === 'faculty1@vernex.in')!
  await logout(page)
  await login(page, faculty)
  await page.goto('/faculty/jury-reviews')
  await expect(page).toHaveURL(/\/unauthorized$/)
})
