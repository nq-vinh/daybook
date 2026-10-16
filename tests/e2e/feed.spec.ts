import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { formatDate, formatMoney, formatSignedMoney } from '../../src/domain/format'
import { transaction } from '../../src/domain/transactions'
import { COUNTERPARTIES, TODAY } from '../../src/domain/world'
import { FEED_EVENTS, type FeedEvent } from '../../src/state/feed'
import { expect, test } from './fixtures'

const LOCALE = 'en-GB'
const STEP_MS = 250
const ANNOUNCE_INTERVAL_MS = 5_000
const FIRST_EVENT_MS = 4_000
const PAUSE_MARGIN_MS = 250

function feedEvent(position: number): FeedEvent {
  const found = FEED_EVENTS[position]
  if (found === undefined) {
    throw new RangeError(`No feed event ${String(position)}`)
  }
  return found
}

function rendered(event: FeedEvent) {
  const { amount, currency, counterpartyId, reference } = transaction(event.id)
  const name = COUNTERPARTIES.find((counterparty) => counterparty.id === counterpartyId)?.name ?? ''
  const money = formatMoney(Math.abs(amount), currency, LOCALE)
  const outcome = event.status === 'declined' ? 'declined' : amount >= 0 ? 'received' : 'booked'
  return {
    name,
    reference,
    href: `/transactions/${String(event.id)}`,
    amount: formatSignedMoney(amount, currency, LOCALE),
    status: event.status === 'booked' ? 'Booked' : 'Declined',
    time: formatDate(TODAY + event.offset, LOCALE, { timeStyle: 'medium' }),
    announcement: `Payment of ${money} ${amount >= 0 ? 'from' : 'to'} ${name} ${outcome}`,
  }
}

function feedItems(page: Page) {
  return page.getByRole('list', { name: 'Settled payments, newest first' }).getByRole('listitem')
}

async function showNewPayments(page: Page, count: number): Promise<void> {
  await page.getByRole('button', { name: count === 1 ? 'Show 1 new payment' : `Show ${String(count)} new payments` }).click()
}

async function pauseAtPageTime(page: Page): Promise<void> {
  const pageNow = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(pageNow + PAUSE_MARGIN_MS)
}

async function openOverviewWithPausedClock(page: Page): Promise<void> {
  await page.clock.install({ time: TODAY })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: 'Incoming payments' })).toBeVisible()
  await expect(page.getByText('Waiting for the first payment.')).toBeVisible()
  await pauseAtPageTime(page)
}

test('shows the exact fifth feed event', async ({ page }) => {
  const fifthOffset = feedEvent(4).offset
  const latestBeforeSixth = feedEvent(5).offset - FIRST_EVENT_MS - PAUSE_MARGIN_MS
  expect(fifthOffset).toBeLessThan(latestBeforeSixth)
  await openOverviewWithPausedClock(page)

  await page.clock.runFor(Math.floor((fifthOffset + latestBeforeSixth) / 2))

  await expect(feedItems(page)).toHaveCount(1)
  await showNewPayments(page, 4)
  await expect(feedItems(page)).toHaveCount(5)
  const fifth = rendered(feedEvent(4))
  const item = feedItems(page).first()
  await expect(item).toHaveAttribute('data-feed-id', String(feedEvent(4).id))
  await expect(item.getByRole('link', { name: fifth.name })).toHaveAttribute('href', fifth.href)
  await expect(item).toContainText(fifth.amount)
  await expect(item).toContainText(fifth.status)
  await expect(item.locator('time')).toHaveText(fifth.time)
  expect(feedEvent(4)).toMatchObject({ id: 5716, status: 'booked', offset: 33_341 })
})

test('defers an announcement inside the 5 s window and changes the live region at most once per window', async ({ page }) => {
  const burst = FEED_EVENTS.findIndex((event, position) => position > 0 && event.offset - feedEvent(position - 1).offset < ANNOUNCE_INTERVAL_MS)
  expect(burst).toBeGreaterThan(0)
  const before = feedEvent(burst - 1)
  const after = feedEvent(burst)
  await openOverviewWithPausedClock(page)
  const card = page.getByRole('region', { name: 'Incoming payments' })
  const changes: { readonly at: number; readonly text: string; readonly newest: string | null; readonly buffered: number }[] = []
  let previous = ''

  for (let elapsed = STEP_MS; elapsed <= after.offset + ANNOUNCE_INTERVAL_MS; elapsed += STEP_MS) {
    await page.clock.runFor(STEP_MS)
    const { text, newest, buffered } = await card.evaluate((section) => ({
      text: section.querySelector('[role="status"]')?.textContent ?? '',
      newest: section.querySelector('li')?.getAttribute('data-feed-id') ?? null,
      buffered: Number(/\d+/.exec(section.querySelector('button:not([aria-pressed])')?.textContent ?? '')?.[0] ?? 0),
    }))
    if (text !== previous) {
      changes.push({ at: elapsed, text, newest, buffered })
      previous = text
    }
  }

  expect(changes.map((change) => change.text)).toEqual(FEED_EVENTS.slice(0, burst + 1).map((event) => rendered(event).announcement))
  const deferred = changes.at(-1)
  const preceding = changes.at(-2)
  expect(deferred?.text).toBe(rendered(after).announcement)
  expect(preceding?.newest).toBe(String(feedEvent(0).id))
  expect(preceding?.buffered).toBe(burst - 1)
  expect(preceding?.text).toBe(rendered(before).announcement)
  expect(after.offset - before.offset).toBeLessThan(ANNOUNCE_INTERVAL_MS)
  for (let position = 1; position < changes.length; position += 1) {
    const gap = (changes[position]?.at ?? 0) - (changes[position - 1]?.at ?? 0)
    expect(gap).toBeGreaterThan(ANNOUNCE_INTERVAL_MS - STEP_MS)
  }
  expect((deferred?.at ?? 0) - (preceding?.at ?? 0)).toBeGreaterThan(after.offset - before.offset + STEP_MS)
})

test('pauses and resumes the feed with a pressed toggle', async ({ page }) => {
  await openOverviewWithPausedClock(page)
  await page.clock.runFor(feedEvent(0).offset)
  await expect(feedItems(page)).toHaveCount(1)

  const toggle = page.getByRole('button', { name: 'Pause', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(60_000)
  await expect(feedItems(page)).toHaveCount(1)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.clock.runFor(feedEvent(1).offset - feedEvent(0).offset)
  await expect(feedItems(page)).toHaveCount(1)
  await showNewPayments(page, 1)
  await expect(feedItems(page)).toHaveCount(2)
  await expect(feedItems(page).first()).toHaveAttribute('data-feed-id', String(feedEvent(1).id))
})

test.describe('ledger rows follow the feed', () => {
  const settled = feedEvent(4)
  const { reference } = rendered(settled)

  function settledRow(page: Page) {
    return page.getByRole('grid', { name: 'Ledger' }).getByRole('row').filter({ has: page.getByRole('link', { name: rendered(settled).name }) })
  }

  test('changes the badge of the settled row in place', async ({ page }) => {
    await page.clock.install({ time: TODAY })
    await page.goto(`/transactions?q=${encodeURIComponent(reference)}`)
    await expect(settledRow(page)).toHaveCount(1)
    await expect(settledRow(page).getByText('Pending')).toBeVisible()
    await settledRow(page).evaluate((row) => {
      row.setAttribute('data-test-tag', 'before-settlement')
    })

    await page.clock.runFor(settled.offset)

    const tagged = page.locator('tr[data-test-tag="before-settlement"]')
    await expect(tagged.getByText('Pending')).toHaveCount(0)
    await expect(tagged).toHaveCount(1)
    await expect(tagged.getByRole('link', { name: rendered(settled).name })).toBeVisible()
  })

  test('drops the settled row from the pending status filter once the worker agrees', async ({ page }) => {
    await page.clock.install({ time: TODAY })
    await page.goto(`/transactions?status=pending&q=${encodeURIComponent(reference)}`)
    await expect(settledRow(page).getByText('Pending')).toBeVisible()

    await page.clock.runFor(settled.offset)

    await expect(page.getByText('No transactions match these filters.')).toBeVisible()
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`passes axe on the overview with feed events in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await openOverviewWithPausedClock(page)
    await page.clock.runFor(feedEvent(2).offset)
    await showNewPayments(page, 2)
    await expect(feedItems(page)).toHaveCount(3)
    await page.clock.resume()

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations, colorScheme).toEqual([])
    await page.screenshot({ path: `output/playwright/screenshots/overview-feed-${colorScheme}.png` })
  })
}
