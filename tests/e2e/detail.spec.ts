import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

const BODY_ROWS = '[role="grid"] tbody tr:not([data-sentinel])'
const FIELDS = ['Date', 'Counterparty', 'Account', 'Amount', 'Category', 'Status', 'Reference', 'VAT rate', 'VAT amount', 'ID']

function grid(page: Page) {
  return page.getByRole('grid', { name: 'Ledger' })
}

async function openLedger(page: Page, search = '') {
  await page.goto(`/transactions${search}`)
  await expect(page.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator(BODY_ROWS).first()).toBeVisible()
}

async function openFirstRow(page: Page): Promise<string> {
  const row = page.locator(BODY_ROWS).first()
  const href = await row.getByRole('link').getAttribute('href')
  if (href === null) {
    throw new Error('The ledger row has no detail link.')
  }
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(href)
  await expect(page.getByRole('heading', { level: 1, name: 'Transaction' })).toBeFocused()
  await expect(page.getByRole('heading', { level: 2, name: 'Details' })).toBeVisible()
  return href
}

test('opens a detail from a focused ledger row and returns to the same ledger query', async ({ page }) => {
  await openLedger(page, '?cat=software&sort=amount:asc')
  const ledgerUrl = page.url()
  const rowCount = await grid(page).getAttribute('aria-rowcount')

  const href = await openFirstRow(page)

  const terms = await page.locator('dl dt').allTextContents()
  expect(terms.filter((term) => term !== 'Card')).toEqual(FIELDS)
  await expect(page.locator('dl > div').filter({ has: page.locator('dt', { hasText: /^ID$/ }) }).locator('dd')).toHaveText(href.split('/').at(-1) ?? '')
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue('software')
  await expect(page.getByRole('table', { name: /^Last \d+ transactions with / })).toBeVisible()

  await page.getByRole('link', { name: 'Back to ledger' }).click()
  await expect(page).toHaveURL(ledgerUrl)
  await expect(page.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
  await expect(grid(page)).toHaveAttribute('aria-rowcount', rowCount ?? '')
})

test('changes the category on the detail page and the ledger row shows it after Back', async ({ page }) => {
  await openLedger(page)
  const href = await openFirstRow(page)
  const select = page.getByRole('combobox', { name: 'Category' })
  const target = (await select.inputValue()) === 'travel' ? { value: 'meals', label: 'Meals' } : { value: 'travel', label: 'Travel' }

  await select.selectOption(target.value)
  await expect(select).toHaveValue(target.value)

  await page.getByRole('link', { name: 'Back to ledger' }).click()
  await expect(page).toHaveURL(/\/transactions$/)
  await expect(page.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
  const row = page.locator(BODY_ROWS).filter({ has: page.locator(`a[href="${href}"]`) })
  await expect(row.locator('td').nth(3)).toHaveText(target.label)
})

test('walks the detail page with the keyboard and opens a history entry from its date link', async ({ page }) => {
  await openLedger(page)
  await openFirstRow(page)
  const history = page.getByRole('table', { name: /^Last \d+ transactions with / })
  await expect(history).toBeVisible()
  const firstLink = history.getByRole('link').first()
  const target = await firstLink.getAttribute('href')

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Back to ledger' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox', { name: 'Category' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('textbox', { name: 'Notes' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(firstLink).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(target ?? '')
  await expect(page.getByRole('heading', { level: 1, name: 'Transaction' })).toBeFocused()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`passes axe on the detail page in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/transactions/4242')
    await expect(page.getByRole('heading', { level: 2, name: 'Details' })).toBeVisible()
    await expect(page.getByRole('table', { name: /^Last \d+ transactions with / })).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations, colorScheme).toEqual([])
    await page.screenshot({ path: `output/playwright/screenshots/detail-${colorScheme}.png`, fullPage: true })
  })
}

test('renders the not found state and title for an unknown transaction id', async ({ page }) => {
  await page.goto('/transactions/100000')

  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await expect(page).toHaveTitle('Page not found - Daybook')
})
