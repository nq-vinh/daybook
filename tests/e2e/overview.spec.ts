import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { TODAY } from '../../src/domain/world'
import { expect, test } from './fixtures'

interface ShiftRecord {
  readonly value: number
  readonly sources: readonly string[]
}

declare global {
  interface Window {
    layoutShifts?: ShiftRecord[]
    flushLayoutShifts?: () => void
    viewTransitionCalls?: number
  }
}

const CLOCK_STEP_MS = 500
const MAX_CLOCK_STEPS = 240
const FRAME_STEP_MS = 250
const DATA_SECTIONS = 3

async function observeLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface LayoutShiftSource { readonly node: Node | null }
    interface LayoutShiftEntry extends PerformanceEntry {
      readonly value: number
      readonly hadRecentInput: boolean
      readonly sources: readonly LayoutShiftSource[]
    }
    const isShift = (entry: PerformanceEntry): entry is LayoutShiftEntry => 'hadRecentInput' in entry
    const describe = (node: Node | null): string => {
      if (!(node instanceof Element)) {
        return node?.nodeName ?? 'unknown'
      }
      const classes = node.getAttribute('class') ?? ''
      return `${node.tagName.toLowerCase()}${classes === '' ? '' : `.${classes.split(' ').join('.')}`}`
    }
    const shifts: ShiftRecord[] = []
    window.layoutShifts = shifts
    const record = (entries: readonly PerformanceEntry[]) => {
      for (const entry of entries) {
        if (isShift(entry) && !entry.hadRecentInput) {
          shifts.push({ value: entry.value, sources: entry.sources.map((source) => describe(source.node)) })
        }
      }
    }
    const observer = new PerformanceObserver((list) => {
      record(list.getEntries())
    })
    observer.observe({ type: 'layout-shift', buffered: true })
    window.flushLayoutShifts = () => {
      record(observer.takeRecords())
    }
  })
}

async function layoutShifts(page: Page): Promise<{ readonly total: number; readonly shifts: readonly ShiftRecord[] }> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  }))
  const shifts = await page.evaluate(() => {
    window.flushLayoutShifts?.()
    return window.layoutShifts ?? []
  })
  return { total: shifts.reduce((sum, shift) => sum + shift.value, 0), shifts }
}

function feedItems(page: Page) {
  return page.getByRole('list', { name: 'Settled payments, newest first' }).getByRole('listitem')
}

async function canvasPainted(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return false
    }
    const context = canvas.getContext('2d')
    if (context === null) {
      return false
    }
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 3; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 0) {
        return true
      }
    }
    return false
  })
}

function overviewRoot(page: Page) {
  return page.locator('main [data-feed-version]')
}

function idleSections(page: Page) {
  return overviewRoot(page).locator('[aria-busy="false"]')
}

async function gotoWithPausedClock(page: Page, path = '/'): Promise<void> {
  await page.clock.install({ time: TODAY })
  await page.clock.pauseAt(TODAY)
  await page.goto(path)
}

interface OverviewWait {
  readonly tiles?: number
  readonly feedVersion?: number
  readonly paused?: boolean
}

async function waitForOverview(page: Page, { tiles = 3, feedVersion = 0, paused = false }: OverviewWait = {}): Promise<void> {
  const painted = async (selector: string): Promise<boolean> => {
    if (paused) {
      await page.clock.runFor(FRAME_STEP_MS)
    }
    return canvasPainted(page, selector)
  }
  if (paused) {
    await expect.poll(async () => {
      await page.clock.runFor(FRAME_STEP_MS)
      return idleSections(page).count()
    }).toBe(DATA_SECTIONS)
  }
  await expect(overviewRoot(page)).toHaveAttribute('data-feed-version', String(feedVersion))
  await expect(idleSections(page)).toHaveCount(DATA_SECTIONS)
  await expect(page.locator('main [role="group"][aria-labelledby] canvas[aria-label^="30-day balance"]')).toHaveCount(tiles)
  await expect.poll(() => painted('figure canvas')).toBe(true)
  await expect.poll(() => painted('canvas[aria-label^="30-day balance"]')).toBe(true)
  await expect(page.getByRole('region', { name: 'Top categories this month' }).getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('table', { name: 'Latest activity' }).getByRole('row')).toHaveCount(11)
}

async function feedVersion(page: Page): Promise<number> {
  return Number(await overviewRoot(page).getAttribute('data-feed-version'))
}

async function runUntilArrivals(page: Page, count: number): Promise<void> {
  for (let step = 0; step < MAX_CLOCK_STEPS && await feedVersion(page) < count; step += 1) {
    await page.clock.runFor(CLOCK_STEP_MS)
  }
  await expect(overviewRoot(page)).toHaveAttribute('data-feed-version', String(count))
  await expect(idleSections(page)).toHaveCount(DATA_SECTIONS)
}

async function showNewPayments(page: Page, count: number): Promise<void> {
  await page.getByRole('button', { name: count === 1 ? 'Show 1 new payment' : `Show ${String(count)} new payments` }).click()
}

test.describe('overview layout stability', () => {
  test('cumulative layout shift on a cold load of / is 0 through five feed arrivals', async ({ page }) => {
    await observeLayoutShifts(page)
    await page.clock.install({ time: TODAY })
    await page.goto('/')
    await waitForOverview(page)
    await runUntilArrivals(page, 5)
    await expect(feedItems(page)).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Show 4 new payments' })).toBeVisible()

    const { total, shifts } = await layoutShifts(page)
    test.info().annotations.push({ type: 'CLS /', description: String(total) })
    expect(shifts, JSON.stringify(shifts)).toEqual([])
    expect(total).toBe(0)
  })

  test('cumulative layout shift on / at a narrow width is 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await observeLayoutShifts(page)
    await page.clock.install({ time: TODAY })
    await page.goto('/')
    await waitForOverview(page)
    await runUntilArrivals(page, 2)

    const { total, shifts } = await layoutShifts(page)
    test.info().annotations.push({ type: 'CLS / narrow', description: String(total) })
    expect(shifts, JSON.stringify(shifts)).toEqual([])
    expect(total).toBe(0)
  })

  for (const width of [700, 720] as const) {
    test(`cumulative layout shift on / at ${String(width)} px is 0 and no tile clips its money`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await observeLayoutShifts(page)
      await page.clock.install({ time: TODAY })
      await page.goto('/')
      await waitForOverview(page)
      await runUntilArrivals(page, 2)

      const clipped = await page.locator('main [role="group"][aria-labelledby] p').evaluateAll((lines) => lines
        .filter((line) => line.scrollWidth > line.clientWidth || line.getBoundingClientRect().right > (line.parentElement?.getBoundingClientRect().right ?? 0) + 0.5)
        .map((line) => line.textContent))
      expect(clipped).toEqual([])
      const columns = await page.locator('main [role="group"][aria-labelledby]').evaluateAll((tiles) => new Set(tiles.map((tile) => Math.round(tile.getBoundingClientRect().left))).size)
      expect(columns).toBe(width < 720 ? 1 : 3)
      const { total, shifts } = await layoutShifts(page)
      test.info().annotations.push({ type: `CLS / ${String(width)}`, description: String(total) })
      expect(shifts, JSON.stringify(shifts)).toEqual([])
      expect(total).toBe(0)
    })
  }

  test('the feed card keeps one height from 0 to 8 events and its heading lines up with Cash flow', async ({ page }) => {
    await observeLayoutShifts(page)
    await page.clock.install({ time: TODAY })
    await page.goto('/')
    await waitForOverview(page)
    const card = page.getByRole('region', { name: 'Incoming payments', exact: true })
    await expect(card.getByText('Waiting for the first payment.')).toBeVisible()
    const height = () => card.evaluate((element) => element.getBoundingClientRect().height)
    const top = async (name: string) => (await page.getByRole('heading', { level: 2, name, exact: true }).boundingBox())?.y ?? Number.NaN
    expect(Math.abs(await top('Cash flow') - await top('Incoming payments'))).toBeLessThanOrEqual(1)
    const heights = [await height()]

    await runUntilArrivals(page, 1)
    await expect(feedItems(page)).toHaveCount(1)
    heights.push(await height())
    await runUntilArrivals(page, 5)
    await expect(page.getByRole('button', { name: 'Show 4 new payments' })).toBeVisible()
    heights.push(await height())
    const { total, shifts } = await layoutShifts(page)
    expect(shifts, JSON.stringify(shifts)).toEqual([])
    expect(total).toBe(0)

    await runUntilArrivals(page, 8)
    await showNewPayments(page, 7)
    await expect(feedItems(page)).toHaveCount(8)
    heights.push(await height())
    test.info().annotations.push({ type: 'Feed card heights', description: JSON.stringify(heights) })
    expect(heights.every((value) => Math.abs(value - (heights[0] ?? 0)) < 0.5), JSON.stringify(heights)).toBe(true)
  })

  test('the loading reservations match the loaded tile and figure heights at 1440', async ({ page }) => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/assets/content-*.js', async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/')
    const skeleton = page.locator('[data-chart-skeleton]')
    await expect(skeleton).toBeVisible()
    const reserved = await page.evaluate(() => ({
      chart: document.querySelector('[data-chart-skeleton]')?.getBoundingClientRect().height ?? 0,
      tile: document.querySelector('main [data-skeleton]')?.parentElement?.getBoundingClientRect().height ?? 0,
    }))
    release()
    await waitForOverview(page)
    const loaded = await page.evaluate(() => ({
      chart: document.querySelector('main figure')?.getBoundingClientRect().height ?? 0,
      tile: document.querySelector('main [role="group"][aria-labelledby]')?.getBoundingClientRect().height ?? 0,
    }))
    test.info().annotations.push({ type: 'Reservations', description: JSON.stringify({ reserved, loaded }) })
    expect(Math.abs(reserved.chart - loaded.chart), JSON.stringify({ reserved, loaded })).toBeLessThan(0.5)
    expect(Math.abs(reserved.tile - loaded.tile), JSON.stringify({ reserved, loaded })).toBeLessThan(0.5)
  })

  test('cumulative layout shift on a cold load of /transactions is 0', async ({ page }) => {
    await observeLayoutShifts(page)
    await page.goto('/transactions')
    await expect(page.getByRole('grid', { name: 'Ledger' })).toHaveAttribute('aria-rowcount', '100001')
    await expect(page.getByRole('grid', { name: 'Ledger' }).getByRole('row').nth(5)).toBeVisible()

    const { total, shifts } = await layoutShifts(page)
    test.info().annotations.push({ type: 'CLS /transactions', description: String(total) })
    expect(shifts, JSON.stringify(shifts)).toEqual([])
    expect(total).toBe(0)
  })

  test('cumulative layout shift on a cold load of /design is 0', async ({ page }) => {
    await observeLayoutShifts(page)
    await page.goto('/design')
    await expect(page.locator('[data-measured-scheme]')).toHaveAttribute('data-measured-scheme', 'light')
    await expect.poll(() => canvasPainted(page, 'figure canvas')).toBe(true)

    const { total, shifts } = await layoutShifts(page)
    test.info().annotations.push({ type: 'CLS /design', description: String(total) })
    expect(shifts, JSON.stringify(shifts)).toEqual([])
    expect(total).toBe(0)
  })
})

async function spyOnViewTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.viewTransitionCalls = 0
    const original = document.startViewTransition.bind(document)
    document.startViewTransition = (...args: Parameters<typeof original>) => {
      window.viewTransitionCalls = (window.viewTransitionCalls ?? 0) + 1
      return original(...args)
    }
  })
}

async function navigateAwayAndBack(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
}

test.describe('overview under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the sparkline is complete in its first frame', async ({ page }) => {
    await page.goto('/')
    const same = await page.evaluate(async () => {
      const wait = (ms: number) => new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
      })
      const painted = (canvas: HTMLCanvasElement): boolean => {
        if (canvas.width === 0) {
          return false
        }
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
        return data?.some((value, index) => index % 4 === 3 && value > 0) ?? false
      }
      const find = () => document.querySelector<HTMLCanvasElement>('canvas[aria-label^="30-day balance"]')
      await new Promise<void>((resolve) => {
        const tick = () => {
          const canvas = find()
          if (canvas !== null && painted(canvas)) {
            resolve()
          } else {
            requestAnimationFrame(tick)
          }
        }
        tick()
      })
      await wait(30)
      const early = find()?.toDataURL()
      await wait(400)
      return early !== undefined && early === find()?.toDataURL()
    })

    expect(same).toBe(true)
  })

  test('feed highlight, chart cursor and view transition are motionless', async ({ page }) => {
    await spyOnViewTransitions(page)
    await page.clock.install({ time: TODAY })
    await page.goto('/')
    await waitForOverview(page)
    await runUntilArrivals(page, 1)

    await expect(feedItems(page).first()).toHaveAttribute('data-arrived', '')
    await expect(feedItems(page).first()).toHaveCSS('animation-duration', '0s')
    await expect(page.locator('[data-chart-crosshair]')).toHaveCSS('transition-duration', '0s')
    await expect(page.locator('[data-chart-anchor]')).toHaveCSS('transition-duration', '0s')

    await navigateAwayAndBack(page)
    expect(await page.evaluate(() => window.viewTransitionCalls)).toBe(0)
  })
})

test('a popstate navigation runs a view transition without reduced motion', async ({ page }) => {
  await spyOnViewTransitions(page)
  await page.goto('/')
  await navigateAwayAndBack(page)
  expect(await page.evaluate(() => window.viewTransitionCalls)).toBe(1)
})

test('the HUD reports a chart draw rate after a resize on /', async ({ page }) => {
  await gotoWithPausedClock(page)
  await waitForOverview(page, { paused: true })
  await page.getByRole('button', { name: 'Performance' }).click()
  const hud = page.getByRole('region', { name: 'Performance', exact: true })
  await expect.poll(async () => {
    await page.clock.runFor(FRAME_STEP_MS)
    return hud.isVisible()
  }).toBe(true)

  for (const width of [1400, 1360, 1320, 1280, 1240, 1200, 1240, 1280, 1320, 1360, 1400, 1440]) {
    await page.setViewportSize({ width, height: 950 })
    await page.clock.runFor(FRAME_STEP_MS)
  }

  const drawRate = hud.locator('div').filter({ has: page.getByText('Chart draw rate', { exact: true }) }).locator('dd')
  await expect.poll(async () => {
    await page.clock.runFor(FRAME_STEP_MS)
    return drawRate.innerText()
  }).toMatch(/^\d[\d,]* fps$/)
  const domNodes = hud.locator('div').filter({ has: page.getByText('DOM nodes', { exact: true }) }).locator('dd')
  await expect(domNodes).toHaveText(/^\d[\d,]*$/)
  test.info().annotations.push(
    { type: 'Chart draw rate', description: await drawRate.innerText() },
    { type: 'DOM nodes', description: await domNodes.innerText() },
  )
})

test('merging buffered arrivals lists them newest first, scrolled to the top, with focus on the newest', async ({ page }) => {
  await page.clock.install({ time: TODAY })
  await page.goto('/')
  await waitForOverview(page)
  await runUntilArrivals(page, 3)
  await expect(feedItems(page)).toHaveCount(1)
  const first = await feedItems(page).first().getAttribute('data-feed-id')

  await showNewPayments(page, 2)
  await expect(feedItems(page)).toHaveCount(3)
  await expect(feedItems(page).last()).toHaveAttribute('data-feed-id', first ?? '')
  await expect(feedItems(page).first().getByRole('link')).toBeFocused()
  expect(await page.locator('[data-scroll-region]').filter({ has: feedItems(page).first() }).evaluate((region) => region.scrollTop)).toBe(0)
  await expect(page.getByRole('button', { name: /new payment/ })).toHaveCount(0)
})

test('the chart cursor walks the months from the keyboard and the fallback table has 16 rows', async ({ page }) => {
  await gotoWithPausedClock(page)
  await waitForOverview(page, { paused: true })
  await page.getByText('Show as table').click()
  const rows = page.locator('figure table tbody tr')
  await expect(rows).toHaveCount(16)
  const labels = await rows.locator('th').allInnerTexts()

  const cursor = page.getByRole('group', { name: 'Net cash flow by month' })
  const readout = page.locator('figure [aria-live="polite"]')
  await cursor.focus()
  await page.keyboard.press('Home')
  await expect(readout).toHaveText(new RegExp(`^${labels[0] ?? ''}: net `))
  await page.keyboard.press('ArrowRight')
  await expect(readout).toHaveText(new RegExp(`^${labels[1] ?? ''}: net `))
  await page.keyboard.press('End')
  await expect(readout).toHaveText(new RegExp(`^${labels[15] ?? ''}: net .*, forecast$`))
  await page.keyboard.press('ArrowLeft')
  await expect(readout).toHaveText(new RegExp(`^${labels[14] ?? ''}: net `))
})

test('the chart table at 390 px scrolls inside its region without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await waitForOverview(page)
  await page.getByText('Show as table').click()
  await expect(page.locator('figure table tbody tr')).toHaveCount(16)
  await expect(page.locator('figure [data-scroll-region]')).toHaveAttribute('tabindex', '0')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

for (const width of [1440, 390] as const) {
  test(`the header keeps the search label on one line at ${String(width)} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const label = page.locator('form[role="search"] label')
    const box = await label.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      line: Number.parseFloat(getComputedStyle(element).lineHeight),
      suffix: element.querySelector('span')?.getBoundingClientRect().width ?? 0,
    }))
    expect(Math.abs(box.height - box.line), JSON.stringify(box)).toBeLessThan(1)
    expect(box.suffix <= 1, JSON.stringify(box)).toBe(width < 640)
    await expect(page.getByRole('searchbox', { name: 'Search transactions' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    if (width < 640) {
      const box = async (locator: ReturnType<Page['locator']>) => {
        const rect = await locator.boundingBox()
        expect(rect).not.toBeNull()
        const { y, height } = rect ?? { y: 0, height: 0 }
        return { top: y, bottom: y + height, middle: y + height / 2 }
      }
      const wordmark = await box(page.getByRole('link', { name: 'Daybook' }))
      const account = await box(page.locator('header label').filter({ hasText: /^Account$/ }).locator('..'))
      const search = await box(page.locator('form[role="search"]'))
      const theme = await box(page.getByRole('radiogroup', { name: 'Theme' }))
      const hud = await box(page.getByRole('button', { name: 'Performance' }))
      const nav = await box(page.getByRole('navigation', { name: 'Main' }))
      expect(wordmark.bottom, 'the wordmark has its own row').toBeLessThanOrEqual(Math.min(account.top, search.top) + 0.5)
      expect(Math.abs(account.top - search.top), 'account and search share the second row').toBeLessThan(1)
      expect(Math.max(account.bottom, search.bottom)).toBeLessThanOrEqual(Math.min(theme.top, hud.top) + 0.5)
      expect(Math.abs(theme.middle - hud.middle), 'theme and HUD share the third row').toBeLessThan(1)
      expect(Math.max(theme.bottom, hud.bottom)).toBeLessThanOrEqual(nav.top + 0.5)
      const mainNav = page.getByRole('navigation', { name: 'Main' })
      const outside = await mainNav.getByRole('link').evaluateAll((links) => links
        .filter((link) => {
          const { left, right } = link.getBoundingClientRect()
          return left < 0 || right > document.documentElement.clientWidth
        })
        .map((link) => link.textContent.trim()))
      expect(outside, 'every nav link sits fully inside the viewport').toEqual([])
      expect(await mainNav.evaluate((element) => element.scrollWidth <= element.clientWidth), 'the nav does not scroll sideways').toBe(true)

      const design = mainNav.getByRole('link', { name: 'Design' })
      await page.getByRole('link', { name: 'Daybook' }).focus()
      for (let step = 0; step < 20 && !(await design.evaluate((element) => element === document.activeElement)); step += 1) {
        await page.keyboard.press('Tab')
      }
      await expect(design).toBeFocused()
      const ring = await design.evaluate((link) => {
        const style = getComputedStyle(link)
        const reach = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
        const box = link.getBoundingClientRect()
        const navBox = link.closest('nav')?.getBoundingClientRect() ?? box
        const clippers: string[] = []
        for (let node = link.parentElement; node !== null && node !== document.body; node = node.parentElement) {
          const { overflowX, overflowY } = getComputedStyle(node)
          if (overflowX !== 'visible' || overflowY !== 'visible') {
            clippers.push(node.tagName.toLowerCase())
          }
        }
        return {
          outline: style.outlineStyle,
          reach,
          clippers,
          inside: box.left - reach >= navBox.left - 0.5
            && box.right + reach <= navBox.right + 0.5
            && box.top >= navBox.top - 0.5
            && box.bottom <= navBox.bottom + 0.5
            && box.left - reach >= 0
            && box.right + reach <= document.documentElement.clientWidth,
        }
      })
      expect(ring.outline, JSON.stringify(ring)).toBe('solid')
      expect(ring.reach, JSON.stringify(ring)).toBeGreaterThan(0)
      expect(ring.clippers, 'no ancestor of the nav links clips overflow').toEqual([])
      expect(ring.inside, 'the Design link and its focus ring are not clipped').toBe(true)
    }
  })
}

test('the header controls never intersect or overflow the page and the theme and HUD toggles stay together on the right from 600 to 1440 px', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('searchbox', { name: 'Search transactions' })).toBeVisible()
  const failures: string[] = []
  for (let width = 600; width <= 1440; width += 16) {
    await page.setViewportSize({ width, height: 900 })
    const layout = await page.evaluate(() => {
      const header = document.querySelector('header')
      const find = (selector: string, text: string) => [...(header?.querySelectorAll(selector) ?? [])]
        .find((element) => (element.getAttribute('aria-label') ?? element.textContent.trim()) === text)
      const elements = {
        wordmark: find('a', 'Daybook'),
        account: find('label', 'Account')?.parentElement,
        search: header?.querySelector('form[role="search"]'),
        theme: header?.querySelector('[role="radiogroup"]'),
        hud: find('button', 'Performance'),
      }
      const bar = elements.wordmark?.parentElement
      const barRight = bar ? bar.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(bar).paddingInlineEnd) : 0
      const rect = (element: Element | null | undefined) => {
        const { left, right, top, bottom } = element?.getBoundingClientRect() ?? { left: 0, right: 0, top: 0, bottom: 0 }
        return { left, right, top, bottom }
      }
      return {
        boxes: Object.entries(elements).map(([name, element]) => ({ name, found: element !== undefined && element !== null, ...rect(element) })),
        inner: [
          { name: 'search input', box: rect(elements.search?.querySelector('input')), outer: rect(elements.search) },
          { name: 'account select', box: rect(elements.account?.querySelector('select')), outer: rect(elements.account) },
        ],
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        barRight,
      }
    })
    const { boxes, inner, overflow, barRight } = layout
    if (overflow) {
      failures.push(`${String(width)}: page overflows`)
    }
    const theme = boxes.find(({ name }) => name === 'theme')
    const hud = boxes.find(({ name }) => name === 'hud')
    if (theme && hud) {
      if (Math.abs((theme.top + theme.bottom) / 2 - (hud.top + hud.bottom) / 2) > 0.5) {
        failures.push(`${String(width)}: theme and hud on different rows`)
      }
      if (Math.abs(hud.right - barRight) > 0.5) {
        failures.push(`${String(width)}: hud not right-aligned`)
      }
    }
    for (const [index, first] of boxes.entries()) {
      if (!first.found) {
        failures.push(`${String(width)}: ${first.name} missing`)
      }
      for (const second of boxes.slice(index + 1)) {
        const across = Math.min(first.right, second.right) - Math.max(first.left, second.left)
        const down = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
        if (across > 0.5 && down > 0.5) {
          failures.push(`${String(width)}: ${first.name} meets ${second.name}`)
        }
      }
    }
    for (const { name, box, outer } of inner) {
      if (box.left < outer.left - 0.5 || box.right > outer.right + 0.5) {
        failures.push(`${String(width)}: ${name} leaves its field`)
      }
    }
  }
  expect(failures).toEqual([])
})

test('the header tab order follows the visual order at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const navLinks = await page.getByRole('navigation', { name: 'Main' }).getByRole('link').count()
  await page.getByRole('link', { name: 'Daybook' }).focus()
  const names: string[] = []
  for (let step = 0; step < 5 + navLinks; step += 1) {
    if (step > 0) {
      await page.keyboard.press('Tab')
    }
    names.push(await page.evaluate((index) => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) {
        return 'none'
      }
      active.dataset.tabStep = String(index)
      const name = active instanceof HTMLInputElement || active instanceof HTMLSelectElement
        ? active.labels?.[0]?.textContent.trim() ?? ''
        : active.getAttribute('aria-label') ?? active.textContent.trim()
      return `${active.tagName.toLowerCase()}:${active.closest('[role="radiogroup"]') === null ? name : 'theme'}`
    }, step))
  }
  expect(names.slice(0, 5)).toEqual(['a:Daybook', 'select:Account', 'input:Search transactions', 'input:theme', 'button:Performance'])
  expect(names.slice(5).every((name) => name.startsWith('a:'))).toBe(true)

  const boxes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-tab-step]')]
    .sort((first, second) => Number(first.dataset.tabStep) - Number(second.dataset.tabStep))
    .map((element) => {
      const { left, right, top, bottom } = (element.closest('[role="radiogroup"]') ?? element).getBoundingClientRect()
      return { left, right, top, bottom }
    }))
  const outOfOrder = boxes.slice(1).flatMap((box, index) => {
    const previous = boxes[index] ?? box
    const nextRow = box.top >= previous.bottom - 0.5
    const sameRowAfter = box.top < previous.bottom && box.bottom > previous.top && box.left >= previous.right - 0.5
    return nextRow || sameRowAfter ? [] : [`${names[index] ?? ''} -> ${names[index + 1] ?? ''}`]
  })
  expect(outOfOrder).toEqual([])
})

test.describe('overview keyboard, axe and scope', () => {
  test('tab order skips the tiles and reaches the chart, the feed and the latest activity', async ({ page }) => {
    await page.clock.install({ time: TODAY })
    await page.goto('/')
    await waitForOverview(page)
    const pageNow = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(pageNow + 250)

    await page.getByRole('heading', { level: 1, name: 'Overview' }).focus()
    const order: string[] = []
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab')
      order.push(await page.evaluate(() => {
        const active = document.activeElement
        if (active === null) {
          return 'none'
        }
        const name = active.getAttribute('aria-label') ?? active.textContent.trim()
        return `${active.tagName.toLowerCase()}:${name}`
      }))
    }

    expect(order.slice(0, 3)).toEqual(['div:Net cash flow by month', 'summary:Show as table', 'button:Pause'])
    expect(order[3]).toMatch(/^a:/)
    const firstLatest = await page.getByRole('table', { name: 'Latest activity' }).getByRole('link').first().innerText()
    expect(order[3]).toBe(`a:${firstLatest}`)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on the loaded overview in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.clock.install({ time: TODAY })
      await page.goto('/')
      await waitForOverview(page)
      await runUntilArrivals(page, 8)
      await showNewPayments(page, 7)
      await expect(feedItems(page)).toHaveCount(8)
      await expect(page.getByRole('region', { name: 'Settled payments, scrolls' })).toBeVisible()
      await feedItems(page).nth(7).scrollIntoViewIfNeeded()
      await expect(feedItems(page).nth(7)).toBeInViewport()
      await page.getByText('Show as table').click()

      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations, colorScheme).toEqual([])
    })
  }

  test('the account switcher scopes tiles, chart and categories', async ({ page }) => {
    await gotoWithPausedClock(page)
    await waitForOverview(page, { paused: true })
    await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption({ label: 'Operations (USD)' })
    await expect(page).toHaveURL(/account=acc-ops/)
    await waitForOverview(page, { tiles: 1, paused: true })

    await expect(page.locator('main [role="group"][aria-labelledby]').filter({ has: page.locator('canvas') })).toHaveText(/^Operations/)
    await expect(page.locator('figure p').first()).toContainText('US$')
    const amounts = await page.getByRole('region', { name: 'Top categories this month' }).getByRole('listitem').allInnerTexts()
    expect(amounts.every((text) => text.includes('US$'))).toBe(true)
  })
})
