import { defineConfig } from '@playwright/test'

import base, { desktop } from './playwright.config'

export default defineConfig({
  ...base,
  reporter: 'list',
  projects: [
    {
      name: 'screenshots',
      testMatch: 'screenshots.spec.ts',
      use: { ...desktop, reducedMotion: 'reduce' },
    },
  ],
})
