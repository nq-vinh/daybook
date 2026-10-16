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

test.describe('charts at device scale factor 2', () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1440, height: 950 } })

  test('the cash-flow canvas backing store is twice its CSS box', async ({ page }) => {
    await page.goto('/design#charts')
    const canvas = page.getByRole('img', { name: /^Net cash flow over/ })
    await canvas.scrollIntoViewIfNeeded()

    await expect.poll(() => canvas.evaluate((element) => {
      const { width, height } = element.getBoundingClientRect()
      return element instanceof HTMLCanvasElement
        ? [element.width - Math.round(width * 2), element.height - Math.round(height * 2), Math.round(width)]
        : null
    })).toEqual([0, 0, expect.any(Number)])
  })

  test('the tooltip sits beside the active bar and never covers it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/design#charts')
    const cursor = page.getByRole('group', { name: 'Net cash flow by month' })
    await cursor.scrollIntoViewIfNeeded()
    await cursor.focus()

    for (const keys of [[], ['Home'], ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'], ['End']]) {
      for (const key of keys) {
        await page.keyboard.press(key)
      }
      const overlap = await page.evaluate(() => {
        const bar = document.querySelector('[data-chart-anchor]')?.getBoundingClientRect()
        const tooltip = document.querySelector('[data-chart-tooltip]')?.getBoundingClientRect()
        if (bar === undefined || tooltip === undefined || tooltip.width === 0 || bar.width === 0) {
          return 'missing'
        }
        const crossesColumn = tooltip.left < bar.right && tooltip.right > bar.left
        const crossesBar = crossesColumn && tooltip.top < bar.bottom && tooltip.bottom > bar.top
        return crossesBar ? 'covers bar' : crossesColumn && tooltip.bottom > bar.top ? 'in column below top' : 'clear'
      })

      expect(overlap, keys.join(' ') || 'focus').toBe('clear')
    }
  })
})

test.describe('HUD and toasts on a narrow viewport', () => {
  test.use({ viewport: { width: 480, height: 800 } })

  test('toasts stack above the open HUD and never overlap it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      window.localStorage.setItem('hud', 'on')
    })
    await page.goto('/design')
    const hud = page.getByRole('region', { name: 'Performance', exact: true })
    await expect(hud).toBeVisible()

    const archive = page.getByRole('button', { name: 'Archive 3 transactions' })
    await archive.click()
    await archive.click()
    const toasts = page.locator('article[aria-labelledby]').filter({ hasText: 'Archived 3 transactions' })
    await expect(toasts).toHaveCount(2)

    const hudBox = await hud.boundingBox()
    const toastBoxes = await toasts.evaluateAll((cards) => cards.map((card) => {
      const { top, bottom, left, right } = card.getBoundingClientRect()
      return { top, bottom, left, right }
    }))

    expect(hudBox).not.toBeNull()
    for (const box of toastBoxes) {
      const overlaps = hudBox !== null
        && box.left < hudBox.x + hudBox.width && box.right > hudBox.x
        && box.top < hudBox.y + hudBox.height && box.bottom > hudBox.y
      expect(overlaps, JSON.stringify({ box, hudBox })).toBe(false)
    }
  })
})
