import type { Page, TestInfo } from '@playwright/test'

const safeUrl = (raw: string) => {
  try { const url = new URL(raw); return `${url.origin}${url.pathname}` } catch { return 'unavailable' }
}

export function collectSafeDiagnostics(page: Page, testInfo: TestInfo) {
  const messages: string[] = []
  page.on('console', (entry) => { if (entry.type() === 'error') messages.push(`console: ${entry.text().slice(0, 300)}`) })
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message.slice(0, 300)}`))
  page.on('requestfailed', (request) => messages.push(`requestfailed: ${safeUrl(request.url())} ${request.failure()?.errorText ?? ''}`))
  return async () => {
    if (messages.length) await testInfo.attach('safe-browser-diagnostics', { body: messages.join('\n'), contentType: 'text/plain' })
  }
}
