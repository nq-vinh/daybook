import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'

import { TODAY } from '../../src/domain/world'
import { COMMIT_LATENCY_MS } from '../../src/state/optimistic'
import { expect, test } from './fixtures'

declare global {
  interface Window {
    editWrites?: string[]
  }
}

const BODY_ROWS = '[role="grid"] tbody tr:not([data-sentinel])'

async function openLedgerWithPausedClock(page: Page) {
  await page.clock.install({ time: TODAY })
  await openLedger(page)
  await pauseAtPageTime(page)
}

async function pauseAtPageTime(page: Page) {
  const pageNow = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(pageNow + 100)
}

async function openLedger(page: Page) {
  await page.goto('/transactions')
  await expect(page.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator(BODY_ROWS).first()).toBeVisible()
}

function categoryCell(row: Locator): Locator {
  return row.locator('td').nth(3)
}

async function storedCategories(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('edits')
    return raw === null ? {} : (JSON.parse(raw) as { categories: Record<string, string> }).categories
  })
}

async function recordEditWrites(page: Page): Promise<Page> {
  const observer = await page.context().newPage()
  await observer.goto('/404')
  await observer.evaluate(() => {
    const writes: string[] = []
    window.addEventListener('storage', (event) => {
      if (event.key === 'edits' && event.newValue !== null) {
        writes.push(event.newValue)
      }
    })
    window.editWrites = writes
  })
  return observer
}

async function rowId(row: Locator): Promise<string> {
  const href = await row.getByRole('link').first().getAttribute('href')
  const id = href?.split('/').at(-1)
  if (id === undefined) {
    throw new Error('The ledger row has no detail link.')
  }
  return id
}

async function categoriseFirstTwo(page: Page) {
  const rows = [page.locator(BODY_ROWS).nth(0), page.locator(BODY_ROWS).nth(1)]
  const ids = [await rowId(rows[0] as Locator), await rowId(rows[1] as Locator)]
  const before = await Promise.all(rows.map((row) => categoryCell(row).textContent()))
  for (const row of rows) {
    await row.getByRole('checkbox').check()
  }
  const bar = page.getByRole('region', { name: 'Selection' })
  await bar.getByRole('combobox', { name: 'Category' }).selectOption('marketing')
  await bar.getByRole('button', { name: 'Categorise 2 transactions' }).click()
  return { rows, ids, before }
}

test('categorises two rows at once, commits at the latency boundary and undoes after the commit', async ({ page }) => {
  await openLedgerWithPausedClock(page)
  const { rows, ids, before } = await categoriseFirstTwo(page)
  expect(before).not.toContain('Marketing')

  for (const row of rows) {
    await expect(categoryCell(row)).toHaveText('Marketing')
  }
  await expect(page.getByText('Categorised 2 transactions as Marketing')).toBeVisible()
  await page.clock.runFor(COMMIT_LATENCY_MS - 1)
  expect(Object.keys(await storedCategories(page))).not.toContain(ids[0])

  await page.clock.runFor(1)
  await expect.poll(() => storedCategories(page)).toMatchObject({ [ids[0] ?? '']: 'marketing', [ids[1] ?? '']: 'marketing' })

  await page.getByRole('button', { name: 'Undo' }).click()
  for (const [index, row] of rows.entries()) {
    await expect(categoryCell(row)).toHaveText(before[index] ?? '')
  }
  await expect.poll(async () => Object.keys(await storedCategories(page))).not.toContain(ids[0])
  expect(Object.keys(await storedCategories(page))).not.toContain(ids[1])
  await expect(page.getByText('Restored the previous category for 2 transactions')).toBeVisible()
})

test('undo before the commit reverts the rows and never writes the edit, while a committed action does', async ({ page }) => {
  await openLedgerWithPausedClock(page)
  const observer = await recordEditWrites(page)
  const { rows, ids, before } = await categoriseFirstTwo(page)

  await page.clock.runFor(COMMIT_LATENCY_MS - 1)
  await page.getByRole('button', { name: 'Undo' }).click()
  for (const [index, row] of rows.entries()) {
    await expect(categoryCell(row)).toHaveText(before[index] ?? '')
  }
  await page.clock.runFor(COMMIT_LATENCY_MS)

  const control = page.locator(BODY_ROWS).nth(2)
  const controlId = await rowId(control)
  const target = (await categoryCell(control).textContent()) === 'Marketing' ? 'travel' : 'marketing'
  await control.getByRole('checkbox').check()
  const bar = page.getByRole('region', { name: 'Selection' })
  await bar.getByRole('combobox', { name: 'Category' }).selectOption(target)
  await bar.getByRole('button', { name: 'Categorise 1 transaction' }).click()
  await page.clock.runFor(COMMIT_LATENCY_MS)

  const writesWith = (id: string) => observer.evaluate((key) => (window.editWrites ?? []).filter((write) => write.includes(key)), `"${id}":`)
  await expect.poll(() => writesWith(controlId)).not.toEqual([])
  expect(await writesWith(ids[0] ?? '')).toEqual([])
  expect(await writesWith(ids[1] ?? '')).toEqual([])
})

test('a detail page change survives Back and the toast undoes it on the ledger', async ({ page }) => {
  await page.clock.install({ time: TODAY })
  await openLedger(page)
  const row = page.locator(BODY_ROWS).first()
  const id = await rowId(row)
  const before = await categoryCell(row).textContent()
  await row.getByRole('link').first().click()
  const select = page.getByRole('combobox', { name: 'Category' })
  await expect(select).toBeVisible()
  await pauseAtPageTime(page)
  const target = (await select.inputValue()) === 'marketing' ? { value: 'travel', label: 'Travel' } : { value: 'marketing', label: 'Marketing' }

  await select.selectOption(target.value)
  await expect(select).toHaveValue(target.value)
  await expect(page.getByText(`Categorised as ${target.label}`)).toBeVisible()
  await page.clock.runFor(COMMIT_LATENCY_MS - 1)
  expect((await storedCategories(page))[id]).toBeUndefined()
  await page.clock.runFor(1)
  await expect.poll(async () => (await storedCategories(page))[id]).toBe(target.value)

  await page.getByRole('link', { name: 'Back to ledger' }).click()
  await expect(page).toHaveURL(/\/transactions$/)
  const ledgerRow = page.locator(BODY_ROWS).filter({ has: page.locator(`a[href="/transactions/${id}"]`) })
  await expect(categoryCell(ledgerRow)).toHaveText(target.label)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(categoryCell(ledgerRow)).toHaveText(before ?? '')
  await expect.poll(async () => Object.keys(await storedCategories(page))).not.toContain(id)
  await expect(page.getByText('Restored the previous category', { exact: true })).toBeVisible()
})

test('passes axe with an undo toast visible', async ({ page }) => {
  await openLedger(page)
  await categoriseFirstTwo(page)
  await expect(page.getByText('Categorised 2 transactions as Marketing')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
