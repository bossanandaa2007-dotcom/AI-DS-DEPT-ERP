const { chromium } = require('@playwright/test')
const BASE = `http://localhost:${process.argv[2]}`
const ROLES = {
  hod: { id: 'krishnamurthy_aids', pw: 'krishnamurthy@aids', root: '/hod',
    pages: ['', '/faculty-profiles', '/academic-setup', '/subject-allocation', '/timetable', '/attendance', '/marks', '/requests', '/portion-progress', '/announcements', '/audit', '/reports', '/document-review-assignments'] },
  faculty: { id: 'divya_aids', pw: 'divya@aids', root: '/faculty',
    pages: ['', '/timetable', '/attendance', '/marks', '/requests', '/portion-completion', '/announcements', '/document-reviews'] },
  student: { id: '9124243011', pw: '3011', root: '/student',
    pages: ['', '/timetable', '/attendance', '/marks', '/requests', '/announcements', '/complaints', '/document-status'] },
}
;(async () => {
  const b = await chromium.launch()
  let n = 0
  for (const [role, cfg] of Object.entries(ROLES)) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    let where = '', armed = false
    const seen = new Set()
    p.on('console', (m) => {
      if (!armed || (m.type() !== 'error' && m.type() !== 'warning')) return
      const txt = m.text().slice(0, 160)
      if (/React DevTools/.test(txt)) return
      const k = role + txt
      if (seen.has(k)) return
      seen.add(k); n++
      console.log(`  [${role}${where}] ${m.type()}: ${txt}`)
    })
    p.on('pageerror', e => { if (armed) { n++; console.log(`  [${role}${where}] uncaught: ${e.message.slice(0,160)}`) } })
    await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await p.waitForSelector('#login-email'); await p.fill('#login-email', cfg.id); await p.fill('#login-password', cfg.pw)
    await p.click('button[type="submit"]')
    await p.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 25000 })
    await p.waitForTimeout(3000)
    armed = true
    for (const sub of cfg.pages) { where = sub; await p.goto(`${BASE}${cfg.root}${sub}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2200) }
    armed = false
    console.log(`  ${role}: ${cfg.pages.length} pages visited`)
    await ctx.close()
  }
  await b.close()
  console.log(n === 0 ? '\nDEV-MODE SWEEP: clean — no React warnings, no console errors' : `\nDEV-MODE SWEEP: ${n} distinct issue(s)`)
})()
