import { test as base, expect } from '@playwright/test'

declare global {
  interface Window {
    reportCspViolation?: (message: string) => Promise<void>
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = []

    await page.exposeFunction('reportCspViolation', (message: string) => {
      problems.push(`CSP violation: ${message}`)
    })
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        void window.reportCspViolation?.(`${event.violatedDirective} blocked ${event.blockedURI}`)
      })
    })
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push(`Console error: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => {
      problems.push(`Page error: ${error.message}`)
    })

    await use(page)

    expect(problems).toEqual([])
  },
})

export { expect }
