import { expect, test } from '@playwright/test'
import { accounts, login, logout } from './helpers/auth'

const pages: Record<string, string[]> = {
  super_admin: ['', 'users', 'academic-setup', 'subject-allocation', 'timetable', 'attendance', 'announcements', 'document-review-assignments', 'audit', 'reports'],
  hod: ['', 'faculty-profiles', 'academic-setup', 'subject-allocation', 'timetable', 'attendance', 'marks', 'requests', 'portion-progress', 'announcements', 'document-review-assignments', 'audit', 'reports'],
  faculty: ['', 'timetable', 'attendance', 'marks', 'requests', 'portion-completion', 'document-reviews', 'announcements'],
  lab_assistant: ['', 'lab-timetable', 'attendance', 'leave', 'announcements'],
  student: ['', 'timetable', 'attendance', 'marks', 'requests', 'document-status', 'announcements', 'complaints'],
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

test('student legacy project and OD routes redirect to requests', async ({ page }) => {
  const student = accounts.find((account) => account.role === 'student')!
  await login(page, student)
  for (const segment of ['projects-and-od', 'projects', 'od']) {
    await page.goto(`${student.route}/${segment}`)
    await expect(page).toHaveURL(/\/student\/requests$/)
  }
})

test('hod cannot access admin user profile routes', async ({ page }) => {
  const hod = accounts.find((account) => account.role === 'hod')!
  await login(page, hod)
  for (const route of ['/super-admin/users', '/super-admin/users/hods']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/unauthorized$/)
  }
})

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
