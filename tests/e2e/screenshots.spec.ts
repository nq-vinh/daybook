import { transaction, TRANSACTION_COUNT } from '../../src/domain/transactions'
import { TODAY } from '../../src/domain/world'
import { FEED_EVENTS } from '../../src/state/feed'
import { expect, test } from './fixtures'

const FEED_SHOWN = 3
const STEP_MS = 250
const NOTE = 'Annual renewal, approved by finance. Receipt filed under hosting.'

function detailId(): number {
  for (let id = TRANSACTION_COUNT - 1; id >= 0; id -= 1) {
    const found = transaction(id)
    if (found.cardId !== undefined && found.status === 'booked' && found.amount < 0) {
      return id
    }
  }
  throw new RangeError('No booked card transaction found')
}

function betweenThirdAndFourthEvent(): number {
  const third = FEED_EVENTS[FEED_SHOWN - 1]
  const fourth = FEED_EVENTS[FEED_SHOWN]
  if (third === undefined || fourth === undefined) {
    throw new RangeError('The feed has fewer than four events')
  }
  return Math.floor((third.offset + fourth.offset) / 2)
}

const DETAIL_ID = detailId()

const SHOTS = [
  { name: 'overview', path: '/' },
  { name: 'transactions', path: '/transactions' },
  { name: 'transaction', path: `/transactions/${String(DETAIL_ID)}` },
  { name: 'cards', path: '/cards' },
  { name: 'budgets', path: '/budgets' },
  { name: 'design', path: '/design' },
] as const

for (const colorScheme of ['light', 'dark'] as const) {
  for (const { name, path } of SHOTS) {
    test(`${name} in ${colorScheme}`, async ({ page }) => {
      const settled = async (): Promise<void> => {
        if (name === 'design') {
          await expect(page.locator('[data-measured-scheme]')).toHaveAttribute('data-measured-scheme', colorScheme)
        } else {
          await expect(page.locator('main [data-skeleton]')).toHaveCount(0)
        }
      }
      await page.emulateMedia({ colorScheme })
      await page.addInitScript(({ id, note }) => {
        window.localStorage.setItem('edits', JSON.stringify({ version: 1, categories: {}, notes: { [id]: note }, budgets: {}, cards: {} }))
      }, { id: DETAIL_ID, note: NOTE })
      await page.clock.install({ time: TODAY })
      await page.clock.pauseAt(TODAY)
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()

      for (let elapsed = 0; elapsed < betweenThirdAndFourthEvent(); elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS)
      }
      await settled()

      if (path === '/') {
        const root = page.locator('main [data-feed-version]')
        await expect(root).toHaveAttribute('data-feed-version', String(FEED_SHOWN))
        await expect(root.locator('[aria-busy="false"]')).toHaveCount(3)
        await page.getByRole('button', { name: `Show ${String(FEED_SHOWN - 1)} new payments` }).click()
        await expect(page.getByRole('list', { name: 'Settled payments, newest first' }).getByRole('listitem')).toHaveCount(FEED_SHOWN)
        await page.mouse.move(0, 0)
        await page.locator('main h1').focus()
      }
      for (let frame = 0; frame < 4; frame += 1) {
        await page.clock.runFor(STEP_MS)
      }
      await settled()

      await page.screenshot({ path: `output/screenshots/${name}-${colorScheme}.png` })
    })
  }
}
