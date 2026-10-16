import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

interface EventEntry {
  readonly name: string
  readonly duration: number
  readonly interactionId: number
}

declare global {
  interface Window {
    eventEntries?: EventEntry[]
    eventObserver?: PerformanceObserver
  }
}

const BODY_ROWS = '[role="grid"] tbody tr:not([data-sentinel])'
const INP_BUDGET_MS = 50
const MEASURED_INTERACTIONS = 6

async function settledOn(page: Page, pattern: string) {
  await page.waitForFunction((source) => new RegExp(source).test(window.location.search)
    && document.querySelector('section[aria-busy="false"]') !== null, pattern)
}

async function nextPaints(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 100)
      })
    })
  }))
}

async function drainEntries(page: Page): Promise<EventEntry[]> {
  await nextPaints(page)
  return page.evaluate(() => {
    const entries = window.eventEntries ?? []
    for (const entry of window.eventObserver?.takeRecords() ?? []) {
      entries.push({ name: entry.name, duration: entry.duration, interactionId: entry instanceof PerformanceEventTiming ? entry.interactionId : 0 })
    }
    return entries.splice(0)
  })
}

function longest(entries: readonly EventEntry[]): number {
  return entries.reduce((maximum, entry) => Math.max(maximum, entry.duration), 0)
}

test('keeps every interaction under 50 ms on a 4x CPU throttle', async ({ page }) => {
  await page.addInitScript(() => {
    const entries: EventEntry[] = []
    window.eventEntries = entries
    window.eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        entries.push({ name: entry.name, duration: entry.duration, interactionId: entry instanceof PerformanceEventTiming ? entry.interactionId : 0 })
      }
    })
    window.eventObserver.observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit)
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.goto('/transactions')
  await expect(page.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator(BODY_ROWS).first()).toBeVisible()
  expect(await page.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('event'))).toBe(true)

  await page.getByRole('searchbox', { name: 'Search transactions' }).focus()
  await drainEntries(page)
  await page.keyboard.press('x')
  const firstEdit = longest(await drainEntries(page))
  await page.keyboard.press('Backspace')
  await page.waitForFunction(() => !new URLSearchParams(window.location.search).has('q')
    && document.querySelector('section[aria-busy="false"]') !== null)
  await drainEntries(page)
  test.info().annotations.push({ type: 'first-keystroke-ms', description: String(firstEdit) })

  const before = await page.evaluate(() => performance.interactionCount)

  await page.keyboard.type('inv', { delay: 100 })
  await settledOn(page, '[?&]q=inv(&|$)')

  await page.getByRole('checkbox', { name: 'Software' }).click()
  await settledOn(page, '[?&]cat=software(&|$)')

  await page.getByRole('columnheader', { name: 'Counterparty' }).getByRole('button').click()
  await settledOn(page, '[?&]sort=counterparty:asc(&|$)')

  await page.locator(BODY_ROWS).first().focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => /^\/transactions\/\d+$/.test(window.location.pathname)
    && document.activeElement?.tagName === 'H1')

  const entries = await drainEntries(page)
  const after = await page.evaluate(() => performance.interactionCount)
  const interactions = entries.filter((entry) => entry.interactionId > 0)
  const maximum = longest(interactions)
  test.info().annotations.push({ type: 'inp-max-ms', description: String(maximum) })
  console.log(`inp-max ${String(maximum)} ms, first keystroke ${String(firstEdit)} ms, interactions ${String(after - before)}: ${JSON.stringify(interactions)}`)

  expect(after - before).toBe(MEASURED_INTERACTIONS)
  expect(maximum).toBeLessThan(INP_BUDGET_MS)
})
