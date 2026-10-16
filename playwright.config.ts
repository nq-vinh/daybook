import { defineConfig, devices } from '@playwright/test'

const port = 4180
const baseURL = `http://127.0.0.1:${String(port)}`
export const desktop = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 950 },
  deviceScaleFactor: 2,
}

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'output/playwright/test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'output/playwright/report' }]],
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL,
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['perf.spec.ts', 'screenshots.spec.ts'],
      use: desktop,
    },
    {
      name: 'perf',
      testMatch: 'perf.spec.ts',
      fullyParallel: false,
      workers: 1,
      dependencies: ['chromium'],
      use: process.platform === 'darwin' ? { ...desktop, launchOptions: { chromiumSandbox: true } } : desktop,
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${String(port)} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
