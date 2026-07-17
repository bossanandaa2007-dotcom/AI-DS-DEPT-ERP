import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const environmentPath = path.resolve(currentDirectory, '.env.e2e.local')
if (existsSync(environmentPath)) process.loadEnvFile(environmentPath)

const baseURL = process.env.E2E_BASE_URL
if (!baseURL) throw new Error('E2E_BASE_URL is required in frontend/.env.e2e.local.')
if (!process.env.E2E_USER_PASSWORD) throw new Error('E2E_USER_PASSWORD is required in frontend/.env.e2e.local.')
if (!process.env.E2E_ADMIN_PASSWORD) throw new Error('E2E_ADMIN_PASSWORD is required in frontend/.env.e2e.local.')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
