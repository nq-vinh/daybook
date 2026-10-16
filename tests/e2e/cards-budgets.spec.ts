import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { TODAY } from '../../src/domain/world'
import { COMMIT_LATENCY_MS } from '../../src/state/optimistic'
import { expect, test } from './fixtures'

interface StoredEdits {
  readonly cards: Record<string, string>
  readonly budgets: Record<string, number>
}

async function storedEdits(page: Page): Promise<StoredEdits> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('edits')
    return raw === null ? { cards: {}, budgets: {} } : (JSON.parse(raw) as StoredEdits)
  })
}

async function openCards(page: Page, path = '/cards') {
  await page.goto(path)
  await expect(page.getByRole('meter').first()).toBeVisible()
}

async function openBudgets(page: Page) {
  await page.goto('/budgets')
  await expect(page.getByRole('meter').first()).toBeVisible()
}

function cardRow(page: Page, last4: string) {
  return page.getByRole('listitem').filter({ hasText: `card ending ${last4},` })
}

test('freezes the first card from the keyboard and undo restores it in the page and in storage', async ({ page }) => {
  await openCards(page)
  const row = cardRow(page, '4417')
  const toggle = row.getByRole('switch', { name: 'Frozen' })
  const link = row.getByRole('link', { name: 'View transactions' })

  await page.getByRole('heading', { level: 1, name: 'Cards' }).focus()
  await page.keyboard.press('Tab')
  await expect(toggle).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(link).toBeFocused()
  await expect(link).toHaveAttribute('href', '/transactions?card=card-01')
  await page.keyboard.press('Shift+Tab')
  await expect(toggle).toBeFocused()

  const frozenBadge = row.locator('[data-tone]', { hasText: 'Frozen' })
  await expect(frozenBadge).toHaveCount(0)
  await expect(row.locator('[data-tone]', { hasText: 'Near limit' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(toggle).toBeChecked()
  await expect(frozenBadge).toBeVisible()
  await expect(page.getByText('Froze the card ending 4417', { exact: true })).toBeVisible()
  await expect.poll(async () => (await storedEdits(page)).cards['card-01']).toBe('frozen')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(toggle).not.toBeChecked()
  await expect(frozenBadge).toHaveCount(0)
  await expect.poll(async () => Object.keys((await storedEdits(page)).cards)).not.toContain('card-01')
  await expect(page.getByText('Unfroze the card ending 4417', { exact: true })).toBeVisible()
})

test('moves the switch thumb only when checked and keeps the unchecked thumb visible on its track', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openCards(page)
  const measure = (last4: string) => cardRow(page, last4).getByRole('switch').evaluate((input) => {
    const track = input.nextElementSibling
    const thumb = track?.firstElementChild
    if (!(track instanceof HTMLElement) || !(thumb instanceof HTMLElement)) {
      throw new Error('The switch has no track or thumb.')
    }
    return {
      translate: getComputedStyle(thumb).translate,
      thumb: getComputedStyle(thumb).backgroundColor,
      track: getComputedStyle(track).backgroundColor,
    }
  })
  const off = await measure('4417')
  const on = await measure('5580')
  expect(off.translate).toBe('none')
  expect(on.translate).not.toBe('none')
  expect(off.thumb).not.toBe(off.track)
  expect(off.thumb).not.toBe(on.thumb)
})

test('the header account switcher scopes the card list', async ({ page }) => {
  await openCards(page)
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Main account', 'Operations', 'UK sales'])

  await page.getByRole('combobox', { name: 'Account' }).selectOption('acc-uk')
  await expect(page).toHaveURL(/\/cards\?account=acc-uk$/)
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['UK sales'])
  await expect(page.getByRole('switch', { name: 'Frozen' })).toHaveCount(2)
})

test('saves a budget on Enter after the latency, keeps it across a reload and undo restores a fresh change', async ({ page }) => {
  await page.clock.install({ time: TODAY })
  await openBudgets(page)
  const pageNow = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(pageNow + 100)

  const field = page.getByRole('textbox', { name: 'Travel budget' })
  await field.fill('2000')
  await field.press('Enter')
  await expect(page.getByText('Saved the Travel budget as €2,000.00', { exact: true })).toBeVisible()

  await page.clock.runFor(COMMIT_LATENCY_MS - 1)
  expect((await storedEdits(page)).budgets.travel).toBeUndefined()
  await page.clock.runFor(1)
  await expect.poll(async () => (await storedEdits(page)).budgets.travel).toBe(200_000)

  await page.clock.resume()
  await page.reload()
  await expect(page.getByRole('meter').first()).toBeVisible()
  await expect(field).toHaveValue('€2,000.00')

  await field.fill('2500')
  await field.press('Enter')
  await expect(page.getByText('Saved the Travel budget as €2,500.00', { exact: true })).toBeVisible()
  await expect.poll(async () => (await storedEdits(page)).budgets.travel).toBe(250_000)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Restored the Travel budget to €2,000.00', { exact: true })).toBeVisible()
  await expect.poll(async () => (await storedEdits(page)).budgets.travel).toBe(200_000)
  await field.blur()
  await expect(field).toHaveValue('€2,000.00')
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`passes axe on cards and budgets in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await openCards(page)
    const cards = await new AxeBuilder({ page }).analyze()
    expect(cards.violations, `cards ${colorScheme}`).toEqual([])

    await openBudgets(page)
    const budgets = await new AxeBuilder({ page }).analyze()
    expect(budgets.violations, `budgets ${colorScheme}`).toEqual([])
  })
}
