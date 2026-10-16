import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

interface MeasuredPair {
  readonly pair: string
  readonly ratio: number
  readonly minimum: number
}

async function openDesign(page: Page, colorScheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme })
  await page.goto('/design')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Design system')
  await expect(page.locator('[data-measured-scheme]')).toHaveAttribute('data-measured-scheme', colorScheme)
}

async function readPairs(page: Page): Promise<MeasuredPair[]> {
  return page.locator('tr[data-contrast-pair]').evaluateAll((rows) => rows.map((row) => ({
    pair: Array.from(row.querySelectorAll('code'), (code) => code.textContent).join(' on '),
    ratio: Number(row.getAttribute('data-ratio')),
    minimum: Number(row.getAttribute('data-minimum')),
  })))
}

function expectAllPass(pairs: readonly MeasuredPair[], label: string) {
  expect(pairs.length, label).toBe(30)

  for (const { pair, ratio, minimum } of pairs) {
    expect(ratio, `${label}: ${pair}`).toBeGreaterThanOrEqual(minimum)
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`design page passes axe and every measured pair in ${colorScheme}`, async ({ page }) => {
    await openDesign(page, colorScheme)

    expectAllPass(await readPairs(page), colorScheme)

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations, colorScheme).toEqual([])

    await page.screenshot({ path: `output/playwright/screenshots/design-${colorScheme}.png` })
  })
}

test('switching the theme to dark measures the pairs again', async ({ page }) => {
  await openDesign(page, 'light')
  const light = await readPairs(page)

  await page.getByRole('banner').getByRole('radio', { name: 'Dark' }).check()
  await expect(page.locator('[data-measured-scheme]')).toHaveAttribute('data-measured-scheme', 'dark')
  const dark = await readPairs(page)

  expectAllPass(light, 'light')
  expectAllPass(dark, 'dark')
  expect(dark.some(({ ratio }, index) => ratio !== light[index]?.ratio)).toBe(true)
})
