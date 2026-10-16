import { defineConfig, devices } from '@playwright/test'

const port = 4180
const baseURL = `http://127.0.0.1:${String(port)}`

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
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 950 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${String(port)} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
