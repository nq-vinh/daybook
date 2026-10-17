import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

const announcer = (page: Page) => page.locator('p[role="status"]:not(main *)')

const routes = [
  { path: '/', heading: 'Overview' },
  { path: '/transactions', heading: 'Transactions' },
  { path: '/transactions/1', heading: 'Transaction' },
  { path: '/cards', heading: 'Cards' },
  { path: '/budgets', heading: 'Budgets' },
  { path: '/design', heading: 'Design system' },
  { path: '/no-such-page', heading: 'Page not found' },
] as const

test('every route renders its heading and title', async ({ page }) => {
  for (const { path, heading } of routes) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(page).toHaveTitle(`${heading} - Daybook`)
  }
})

test('the skip link moves focus to main', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')

  const skipLink = page.getByRole('link', { name: 'Skip to content' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeInViewport()

  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
})

test('a link click announces the page and focuses its heading', async ({ page }) => {
  await page.goto('/')
  await expect(announcer(page)).toHaveText('')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Transactions' }).click()

  await expect(page).toHaveURL('/transactions')
  await expect(announcer(page)).toHaveText('Transactions')
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page')
})

test('back restores the previous page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Cards' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cards')

  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview')
  await expect(announcer(page)).toHaveText('Overview')
})

test('main and the header share one content box, fluid at 1440 and centred at 2560', async ({ page }) => {
  const measure = () => page.evaluate(() => {
    const contentBox = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`${selector} is missing`)
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) }
    }
    const root = document.documentElement
    return {
      main: contentBox('main'),
      bar: contentBox('header > div'),
      nav: contentBox('header > nav'),
      layoutWidth: root.getBoundingClientRect().width,
      gutter: parseFloat(getComputedStyle(root).getPropertyValue('--gutter')),
      maxWidth: parseFloat(getComputedStyle(root).getPropertyValue('--content-max-width')),
    }
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview')
  const fluid = await measure()
  expect(fluid.main.right).toBeCloseTo(fluid.bar.right, 0)
  expect(fluid.main.right).toBeCloseTo(fluid.nav.right, 0)
  expect(fluid.main.left).toBeCloseTo(fluid.bar.left, 0)
  expect(fluid.layoutWidth - fluid.main.right).toBeCloseTo(fluid.gutter, 0)
  expect(fluid.main.left).toBeCloseTo(fluid.gutter, 0)

  await page.setViewportSize({ width: 2560, height: 950 })
  const centred = await measure()
  expect(centred.main.right - centred.main.left).toBeCloseTo(centred.maxWidth, 0)
  expect(centred.layoutWidth - centred.main.right).toBeCloseTo(centred.main.left, 0)
  expect(centred.main.right).toBeCloseTo(centred.bar.right, 0)
  expect(centred.main.left).toBeCloseTo(centred.bar.left, 0)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe finds no violations in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })

    for (const { path, heading } of routes) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)

      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations, `${colorScheme} ${path}`).toEqual([])
    }
  })
}
