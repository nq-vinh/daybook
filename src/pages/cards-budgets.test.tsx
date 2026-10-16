import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeClient } from '../../tests/unit/fake-ledger-client'
import { formatMoney } from '../domain/format'
import { BUDGETS, CARDS } from '../domain/world'
import { navigate } from '../router/history'
import { RouterProvider } from '../router/router'
import { ErrorBoundary } from '../router/ErrorBoundary'
import { getEdits, setBudget, setCardStatus } from '../state/edits'
import { deliverForTest, FEED_EVENTS, stopFeed } from '../state/feed'
import { cancelAllForTest, flushForTest } from '../state/optimistic'
import { dismissAllToasts, getToasts } from '../state/toast'
import type { BudgetSpend, CardSpend } from '../worker/protocol'
import { BudgetsContent, budgetMeter, budgetValueText } from './budgets/content'
import { CardsContent, limitState, limitValueText, spendMeter } from './cards/content'
import { notFound, routes } from './routes'

vi.mock('../worker/client', async () => {
  const { sharedLedgerClient: shared } = await import('../../tests/unit/fake-ledger-client')
  return { ledgerClient: shared.client }
})

const CARD_SPEND: readonly CardSpend[] = CARDS.map((card, index) => ({
  cardId: card.id,
  monthToDate: index === 0 ? 2_592_431 : index === 1 ? 4_500_000 : 124_000,
  currency: card.accountId === 'acc-main' ? 'EUR' : card.accountId === 'acc-ops' ? 'USD' : 'GBP',
}))

const BUDGET_SPEND: readonly BudgetSpend[] = BUDGETS.map((budget) => ({
  categoryId: budget.categoryId,
  monthToDate: budget.categoryId === 'rent' ? 1_800_000 : 100_000,
  share: 0.1,
  projected: budget.categoryId === 'travel' ? 18_000_000 : budget.categoryId === 'rent' ? 1_800_000 : 200_000,
}))

function resetEdits() {
  for (const card of CARDS) {
    setCardStatus(card.id, card.status)
  }
  for (const budget of BUDGETS) {
    setBudget(budget.categoryId, null)
  }
}

function toastTitles(): string[] {
  return getToasts().map((toast) => toast.title)
}

async function undoLatest() {
  const latest = getToasts().at(-1)
  await act(async () => {
    latest?.action?.onAction()
    await Promise.resolve()
  })
}

function renderCards(path = '/cards') {
  navigate(path)
  return render(
    <RouterProvider routes={routes} notFound={notFound}>
      <CardsContent client={fakeClient({ cards: CARD_SPEND }).client} />
    </RouterProvider>,
  )
}

function cardRow(last4: string): HTMLElement {
  const row = screen.getByText(new RegExp(`^card ending ${last4},`)).closest('li')
  if (!(row instanceof HTMLElement)) {
    throw new Error(`No row for the card ending ${last4}.`)
  }
  return row
}

function budgetRow(label: string): HTMLElement {
  const row = screen.getByRole('heading', { level: 2, name: label }).closest('li')
  if (!(row instanceof HTMLElement)) {
    throw new Error(`No row for ${label}.`)
  }
  return row
}

beforeEach(() => {
  stopFeed()
  cancelAllForTest()
  dismissAllToasts()
  resetEdits()
})

afterEach(() => {
  stopFeed()
  vi.restoreAllMocks()
  cancelAllForTest()
  dismissAllToasts()
  resetEdits()
})

describe('meters', () => {
  it('clamps the meter value to the maximum and keeps the real amount in the text', () => {
    expect(spendMeter(650_000, 500_000)).toEqual({ value: 500_000, max: 500_000, high: 400_000 })
    expect(budgetMeter(3_000_000, 2_000_000)).toEqual({ value: 2_000_000, max: 2_000_000, high: 1_600_000 })
    expect(budgetMeter(10, 0)).toEqual({ value: 1, max: 1, high: 0.8 })
    expect(budgetValueText(124_000, 200_000)).toBe(`${formatMoney(124_000, 'EUR')} of ${formatMoney(200_000, 'EUR')} (62%)`)
    expect(limitValueText(2_592_431, 1_000_000, 'EUR')).toBe(`${formatMoney(2_592_431, 'EUR')} of ${formatMoney(1_000_000, 'EUR')} (259%)`)
    expect([limitState(799, 1_000), limitState(800, 1_000), limitState(999, 1_000), limitState(1_000, 1_000)]).toEqual(['under', 'near', 'near', 'over'])
  })
})

describe('CardsContent', () => {
  it('shows a skeleton until the spend lands, then one ruled row per card grouped by account', async () => {
    renderCards()
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Main account', 'Operations', 'UK sales'])
    expect(screen.queryByRole('meter')).toBeNull()

    const meters = await screen.findAllByRole('meter')
    expect(meters).toHaveLength(CARDS.length)
    const first = within(cardRow('4417')).getByRole('meter', { name: 'Spent this month' })
    expect(first).toHaveAttribute('value', '2592431')
    expect(first).toHaveAttribute('max', '3000000')
    expect(first).toHaveAttribute('high', '2400000')
    expect(first).toHaveAttribute('aria-valuetext', `${formatMoney(2_592_431, 'EUR')} of ${formatMoney(3_000_000, 'EUR')} (86%)`)
    expect(first).toHaveAccessibleDescription('Ilse Marwick card ending 4417, Main account')
    expect(within(cardRow('4417')).getByText('Near limit')).toHaveAttribute('data-tone', 'warning')
    expect(within(cardRow('4417')).queryByText('Over limit')).toBeNull()

    const over = within(cardRow('0932')).getByRole('meter')
    expect(over).toHaveAttribute('value', '4000000')
    expect(over).toHaveAttribute('aria-valuetext', `${formatMoney(4_500_000, 'EUR')} of ${formatMoney(4_000_000, 'EUR')} (113%)`)
    expect(within(cardRow('0932')).getByText('Over limit')).toHaveAttribute('data-tone', 'negative')
    expect(within(cardRow('0932')).queryByText('Near limit')).toBeNull()
    expect(within(cardRow('0467')).getByRole('meter')).toHaveAttribute('aria-valuetext', `${formatMoney(124_000, 'GBP')} of ${formatMoney(4_000_000, 'GBP')} (3%)`)
    expect(within(cardRow('0467')).queryByText(/^(Near|Over) limit$/)).toBeNull()
    expect(within(cardRow('4417')).getByRole('link', { name: 'View transactions' })).toHaveAttribute('href', '/transactions?card=card-01')
    expect(within(cardRow('4417')).getByRole('link')).toHaveAccessibleDescription('Ilse Marwick card ending 4417, Main account')
  })

  it('marks seeded frozen cards with a badge and a checked switch', async () => {
    renderCards()
    await screen.findAllByRole('meter')
    expect(within(cardRow('5580')).getByText('Frozen', { selector: 'span:not(label span)' })).toBeInTheDocument()
    expect(within(cardRow('5580')).getByRole('switch', { name: 'Frozen' })).toBeChecked()
    expect(within(cardRow('4417')).getByRole('switch', { name: 'Frozen' })).not.toBeChecked()
    expect(within(cardRow('4417')).getByRole('switch')).toHaveAccessibleDescription('Ilse Marwick card ending 4417, Main account')
  })

  it('freezes optimistically with an undo toast, and undo restores both stores after the commit', async () => {
    const user = userEvent.setup()
    renderCards()
    await screen.findAllByRole('meter')
    const row = cardRow('4417')

    await user.click(within(row).getByRole('switch', { name: 'Frozen' }))
    expect(within(row).getByRole('switch')).toBeChecked()
    expect(row).toHaveAttribute('data-frozen')
    expect(toastTitles()).toEqual(['Froze the card ending 4417'])
    expect(getEdits().cards['card-01']).toBeUndefined()

    act(() => {
      flushForTest()
    })
    expect(getEdits().cards['card-01']).toBe('frozen')

    await undoLatest()
    expect(getEdits().cards['card-01']).toBeUndefined()
    expect(within(row).getByRole('switch')).not.toBeChecked()
    expect(row).not.toHaveAttribute('data-frozen')
    expect(toastTitles().at(-1)).toBe('Unfroze the card ending 4417')
  })

  it('unfreezes a frozen card and undo before the commit writes nothing', async () => {
    const user = userEvent.setup()
    renderCards()
    await screen.findAllByRole('meter')
    const row = cardRow('5580')

    await user.click(within(row).getByRole('switch', { name: 'Frozen' }))
    expect(toastTitles()).toEqual(['Unfroze the card ending 5580'])
    expect(within(row).getByRole('switch')).not.toBeChecked()

    await undoLatest()
    expect(within(row).getByRole('switch')).toBeChecked()
    expect(getEdits().cards).toEqual({})
    expect(toastTitles().at(-1)).toBe('Froze the card ending 5580')
  })

  it('fetches the spend again when a feed event lands', async () => {
    const { client } = fakeClient({ cards: CARD_SPEND })
    const cards = vi.spyOn(client, 'cards')
    navigate('/cards')
    render(
      <RouterProvider routes={routes} notFound={notFound}>
        <CardsContent client={client} />
      </RouterProvider>,
    )
    await screen.findAllByRole('meter')
    expect(cards).toHaveBeenCalledTimes(1)

    const event = FEED_EVENTS[0]
    if (event === undefined) {
      throw new Error('The feed has no events.')
    }
    act(() => {
      deliverForTest(event)
    })
    expect(cards).toHaveBeenCalledTimes(2)
  })

  it('throws a failed request to the error boundary and ignores a response after unmount', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = fakeClient().client
    vi.spyOn(failing, 'cards').mockRejectedValue(new Error('The worker failed.'))
    navigate('/cards')
    render(
      <RouterProvider routes={routes} notFound={notFound}>
        <ErrorBoundary pathname="/cards">
          <CardsContent client={failing} />
        </ErrorBoundary>
      </RouterProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('The worker failed.')).toBeInTheDocument()

    let settle: (reason: Error) => void = () => undefined
    const late = fakeClient().client
    vi.spyOn(late, 'budgets').mockReturnValue(new Promise((_, reject) => {
      settle = reject
    }))
    const view = render(
      <ErrorBoundary pathname="/budgets">
        <BudgetsContent client={late} />
      </ErrorBoundary>,
    )
    view.unmount()
    await act(async () => {
      settle(new Error('Too late.'))
      await Promise.resolve()
    })
    expect(screen.queryByText('Too late.')).toBeNull()
  })

  it('scopes the list to the account in the URL', async () => {
    renderCards('/cards?account=acc-uk')
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['UK sales'])
    expect(await screen.findAllByRole('meter')).toHaveLength(CARDS.filter((card) => card.accountId === 'acc-uk').length)
  })
})

describe('BudgetsContent', () => {
  function renderBudgets() {
    return render(<BudgetsContent client={fakeClient({ budgets: BUDGET_SPEND }).client} />)
  }

  it('shows meters, projections, badges and the summary once the spend lands', async () => {
    renderBudgets()
    expect(screen.queryByRole('meter')).toBeNull()
    const meters = await screen.findAllByRole('meter')
    expect(meters).toHaveLength(BUDGETS.length)

    const travel = budgetRow('Travel')
    const meter = within(travel).getByRole('meter', { name: 'Spent this month' })
    expect(meter).toHaveAttribute('value', '100000')
    expect(meter).toHaveAttribute('max', '17000000')
    expect(meter).toHaveAttribute('high', '13600000')
    expect(meter).toHaveAttribute('aria-valuetext', `${formatMoney(100_000, 'EUR')} of ${formatMoney(17_000_000, 'EUR')} (1%)`)
    expect(within(travel).getByText(`Projected ${formatMoney(18_000_000, 'EUR')} by month end`)).toBeInTheDocument()
    expect(within(travel).getByText('Projected to exceed')).toBeInTheDocument()
    expect(within(travel).queryByText('Budget spent')).toBeNull()
    expect(meter).toHaveAccessibleDescription('Travel')

    const rent = budgetRow('Rent')
    expect(within(rent).getByText('Budget spent')).toHaveAttribute('data-tone', 'negative')
    expect(within(rent).queryByText('Projected to exceed')).toBeNull()
    expect(within(budgetRow('Meals')).queryByText(/^(Projected to exceed|Budget spent)$/)).toBeNull()

    const total = BUDGETS.reduce((sum, budget) => sum + budget.monthlyAmount, 0)
    expect(screen.getByRole('group', { name: 'Budgeted this month' })).toHaveTextContent(formatMoney(total, 'EUR'))
    expect(screen.getByRole('group', { name: 'Spent month to date' })).toHaveTextContent(formatMoney(BUDGET_SPEND.reduce((sum, entry) => sum + entry.monthToDate, 0), 'EUR'))
    expect(screen.getByRole('group', { name: 'Projected to exceed' })).toHaveTextContent('1 category')
  })

  it('saves a changed budget on Enter with an undo toast and restores both stores on undo', async () => {
    const user = userEvent.setup()
    renderBudgets()
    await screen.findAllByRole('meter')
    const field = screen.getByRole('textbox', { name: 'Travel budget' })

    await user.click(field)
    await user.clear(field)
    await user.type(field, '200000{Enter}')
    expect(toastTitles()).toEqual([`Saved the Travel budget as ${formatMoney(20_000_000, 'EUR')}`])
    expect(within(budgetRow('Travel')).getByRole('meter')).toHaveAttribute('max', '20000000')
    expect(within(budgetRow('Travel')).queryByText('Projected to exceed')).toBeNull()
    expect(screen.getByRole('group', { name: 'Projected to exceed' })).toHaveTextContent('0 categories')

    await user.tab()
    expect(toastTitles()).toHaveLength(1)
    expect(field).toHaveValue(formatMoney(20_000_000, 'EUR'))

    act(() => {
      flushForTest()
    })
    expect(getEdits().budgets.travel).toBe(20_000_000)

    await undoLatest()
    expect(getEdits().budgets.travel).toBeUndefined()
    expect(field).toHaveValue(formatMoney(17_000_000, 'EUR'))
    expect(toastTitles().at(-1)).toBe(`Restored the Travel budget to ${formatMoney(17_000_000, 'EUR')}`)
  })

  it('saves on blur only when the amount changed', async () => {
    const user = userEvent.setup()
    renderBudgets()
    await screen.findAllByRole('meter')
    const field = screen.getByRole('textbox', { name: 'Meals budget' })

    await user.click(field)
    await user.clear(field)
    await user.type(field, '50000')
    await user.tab()
    expect(toastTitles()).toEqual([])

    await user.click(field)
    await user.clear(field)
    await user.type(field, '1234.5')
    expect(toastTitles()).toEqual([])
    await user.tab()
    expect(toastTitles()).toEqual([`Saved the Meals budget as ${formatMoney(123_450, 'EUR')}`])
  })

  it('shows a zero budget as no budget without badges', async () => {
    setBudget('meals', 0)
    renderBudgets()
    await screen.findAllByRole('meter')
    const meals = budgetRow('Meals')

    expect(within(meals).getByText('No budget')).toBeInTheDocument()
    expect(within(meals).queryByText(/^(Projected to exceed|Budget spent)$/)).toBeNull()
    expect(within(meals).getByRole('meter')).toHaveAttribute('aria-valuetext', `${formatMoney(100_000, 'EUR')} of ${formatMoney(0, 'EUR')}`)
  })

  it('ignores an out-of-range budget from another tab instead of crashing', async () => {
    renderBudgets()
    await screen.findAllByRole('meter')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'edits',
        newValue: JSON.stringify({ version: 1, categories: {}, notes: {}, cards: {}, budgets: { travel: 9e15, meals: 123_400 } }),
      }))
    })
    expect(getEdits().budgets).toEqual({ meals: 123_400 })
    expect(screen.getByRole('textbox', { name: 'Travel budget' })).toHaveValue(formatMoney(17_000_000, 'EUR'))
    expect(screen.getByRole('textbox', { name: 'Meals budget' })).toHaveValue(formatMoney(123_400, 'EUR'))
  })

  it('fetches the spend again when a feed event lands', async () => {
    const { client } = fakeClient({ budgets: BUDGET_SPEND })
    const budgets = vi.spyOn(client, 'budgets')
    render(<BudgetsContent client={client} />)
    await screen.findAllByRole('meter')
    const event = FEED_EVENTS[1]
    if (event === undefined) {
      throw new Error('The feed has no events.')
    }
    act(() => {
      deliverForTest(event)
    })
    expect(budgets).toHaveBeenCalledTimes(2)
  })
})
