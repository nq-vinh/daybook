import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

const BODY_ROWS = '[role="grid"] tbody tr:not([data-sentinel])'
const MIDDLE_ROWS = 35
const END_ROWS = 29
const ROW_TOLERANCE = 3

interface Geometry {
  readonly bodyTop: number
  readonly headHeight: number
  readonly rowHeight: number
  readonly viewportHeight: number
}

async function openLedger(page: Page, search = '') {
  await page.goto(`/transactions${search}`)
  await expect(page.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator(BODY_ROWS).first()).toBeVisible()
}

function grid(page: Page) {
  return page.getByRole('grid', { name: 'Ledger' })
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const table = document.querySelector('[role="grid"]')
    const body = table?.querySelector('tbody')
    const head = table?.querySelector('thead')
    const row = body?.querySelector('tr[aria-rowindex]:not([data-sentinel])')
    if (!table || !body || !head || !row) {
      throw new Error('The ledger grid is not rendered.')
    }
    if (getComputedStyle(head).position !== 'sticky') {
      throw new Error('The ledger thead is not the sticky element.')
    }
    return {
      bodyTop: body.getBoundingClientRect().top + window.scrollY,
      headHeight: head.getBoundingClientRect().height,
      rowHeight: row.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }
  })
}

async function firstVisibleRowIndex(page: Page): Promise<number> {
  return page.evaluate((selector) => {
    const headBottom = document.querySelector('[role="grid"] thead')?.getBoundingClientRect().bottom ?? 0
    const row = [...document.querySelectorAll(selector)].find((candidate) => candidate.getBoundingClientRect().bottom > headBottom + 1)
    return Number(row?.getAttribute('aria-rowindex'))
  }, BODY_ROWS)
}

async function focusedRowIndex(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex') ?? null)
}

test('renders the full ledger with the row count and the totals', async ({ page }) => {
  await openLedger(page)

  await expect(grid(page)).toHaveAttribute('aria-rowcount', '100001')
  const totals = page.locator('dl').filter({ hasText: 'Transactions' })
  await expect(totals.locator('dt')).toHaveText(['Transactions', 'Debits', 'Credits', 'Net'])
  await expect(totals.locator('dd').first()).toHaveText('100,000')
})

test('keeps the DOM row count flat while scrolling 100,000 rows', async ({ page }) => {
  await openLedger(page)
  const { bodyTop, headHeight, rowHeight, viewportHeight } = await geometry(page)
  const bodyHeight = 100_000 * rowHeight
  const measured: Record<string, number> = {}

  for (const [label, target, expected] of [
    ['middle', bodyTop + bodyHeight / 2, MIDDLE_ROWS],
    ['end', bodyTop + bodyHeight, END_ROWS],
  ] as const) {
    await page.evaluate((top) => {
      window.scrollTo(0, top)
    }, target)
    await expect.poll(() => firstVisibleRowIndex(page)).toBeGreaterThan(1_000)
    const scrollY = await page.evaluate(() => window.scrollY)
    const count = await page.locator(BODY_ROWS).count()
    measured[label] = count
    expect.soft(Math.abs(count - expected), `${label}: ${String(count)} rows`).toBeLessThanOrEqual(ROW_TOLERANCE)

    const expectedIndex = Math.floor((scrollY + headHeight - bodyTop) / rowHeight) + 2
    expect(Math.abs((await firstVisibleRowIndex(page)) - expectedIndex)).toBeLessThanOrEqual(1)
  }

  const description = `${JSON.stringify(measured)} at ${String(viewportHeight)} px`
  test.info().annotations.push({ type: 'dom-rows', description })
  console.log(`dom-rows ${description}`)
})

test('focuses the last row on End after clicking a row in a scrolled ledger', async ({ page }) => {
  await openLedger(page)
  await page.evaluate(() => {
    window.scrollTo(0, 1_031)
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1_031)

  const clicked = (await firstVisibleRowIndex(page)) + 2
  await page.locator(`${BODY_ROWS}[aria-rowindex="${String(clicked)}"] td`).last().click()
  expect(await focusedRowIndex(page)).toBe(String(clicked))

  await page.keyboard.press('End')
  const last = page.locator('[role="grid"] tbody tr[aria-rowindex="100001"]')
  await expect(last).toBeVisible()
  await expect(last).toBeFocused()
  await expect(last).toBeInViewport()
})

test('returns into the grid on Shift+Tab without jumping to the top after wheeling away', async ({ page }) => {
  await openLedger(page)
  await page.getByRole('button', { name: 'Credit' }).focus()
  await page.keyboard.press('Tab')
  expect(await focusedRowIndex(page)).toBe('2')

  const { viewportHeight } = await geometry(page)
  await page.mouse.move(720, viewportHeight / 2)
  await page.mouse.wheel(0, 100_000)
  await expect.poll(() => firstVisibleRowIndex(page)).toBeGreaterThan(1_000)
  const wheeled = await page.evaluate(() => window.scrollY)

  const focusInGrid = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="grid"]')))
  await page.keyboard.press('Tab')
  expect(await focusInGrid()).toBe(false)

  await page.keyboard.press('Shift+Tab')
  expect(await focusInGrid()).toBe(true)
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)
  expect(Math.abs(scrollY - wheeled)).toBeLessThan(viewportHeight)

  const sentinel = grid(page).locator('tr[data-sentinel]')
  await expect(sentinel).toBeFocused()
  await expect(sentinel).toHaveText('Row 1 is scrolled out of view. Use the arrow keys to return to it.')
  await page.waitForTimeout(300)
  await expect(sentinel).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)

  await page.mouse.wheel(0, -100_000)
  await expect(page.locator(`${BODY_ROWS}[aria-rowindex="2"]`)).toBeFocused()
})

test('walks the grid with the keyboard over the whole virtual set', async ({ page }) => {
  await openLedger(page)

  await page.getByRole('button', { name: 'Credit' }).focus()
  await page.keyboard.press('Tab')
  expect(await focusedRowIndex(page)).toBe('2')

  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press('ArrowDown')
  }
  expect(await focusedRowIndex(page)).toBe('5')

  await page.keyboard.press('End')
  expect(await focusedRowIndex(page)).toBe('100001')

  await page.keyboard.press('Home')
  expect(await focusedRowIndex(page)).toBe('2')

  const { headHeight, rowHeight, viewportHeight } = await geometry(page)
  const visibleStep = Math.floor((viewportHeight - headHeight - 1) / rowHeight)
  await page.keyboard.press('PageDown')
  const paged = Number(await focusedRowIndex(page))
  expect(Math.abs(paged - (2 + visibleStep))).toBeLessThanOrEqual(1)
  await expect(page.locator(':focus')).toBeInViewport()
})

test('pages by the visible rows right after a jump, before any scroll event lands', async ({ page }) => {
  await openLedger(page)
  await page.getByRole('button', { name: 'Credit' }).focus()
  await page.keyboard.press('Tab')
  expect(await focusedRowIndex(page)).toBe('2')

  const { headHeight, rowHeight, viewportHeight } = await geometry(page)
  const visibleStep = Math.floor((viewportHeight - headHeight - 1) / rowHeight)
  const paged = await page.evaluate(() => {
    for (const key of ['End', 'Home', 'PageDown']) {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }
    return Number(document.activeElement?.getAttribute('aria-rowindex'))
  })
  expect(Math.abs(paged - (2 + visibleStep))).toBeLessThanOrEqual(1)
})

test('round-trips the filters through the URL, reload and history', async ({ page }) => {
  await openLedger(page)

  await page.getByRole('checkbox', { name: 'Software' }).check()
  await expect(page).toHaveURL(/\?cat=software$/)
  await page.getByLabel('From').fill('2025-01-01')
  await expect(page).toHaveURL(/\?cat=software&from=2025-01-01$/)
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('cloud')
  await expect(page).toHaveURL(/\/transactions\?q=cloud&cat=software&from=2025-01-01$/)

  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Software' })).toBeChecked()
  await expect(page.getByLabel('From')).toHaveValue('2025-01-01')
  await expect(page.getByRole('searchbox', { name: 'Search transactions' })).toHaveValue('cloud')

  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Cards' }).click()
  await expect(page).toHaveURL(/\/cards$/)
  await nav.getByRole('link', { name: 'Budgets' }).click()
  await expect(page).toHaveURL(/\/budgets$/)

  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/\/transactions\?q=cloud&cat=software&from=2025-01-01$/)
  await expect(page.getByRole('checkbox', { name: 'Software' })).toBeChecked()
  await expect(page.getByLabel('From')).toHaveValue('2025-01-01')
  await expect(page.getByRole('searchbox', { name: 'Search transactions' })).toHaveValue('cloud')
  await expect(page.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`passes axe with an active filter set in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await openLedger(page, '?account=acc-main&cat=software,travel&status=booked,pending')

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations, colorScheme).toEqual([])
    await page.screenshot({ path: `output/playwright/screenshots/ledger-${colorScheme}.png` })
  })
}

test('loads the ledger worker under the real CSP without console errors', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => {
    workers.push(worker.url())
  })

  await openLedger(page)

  expect(workers.some((url) => /\/assets\/ledger\.worker-[\w-]+\.js$/.test(url))).toBe(true)
})
