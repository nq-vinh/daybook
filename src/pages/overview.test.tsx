import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fakeClient } from '../../tests/unit/fake-ledger-client'
import { formatMoney } from '../domain/format'
import { ACCOUNTS, type AccountId, BUDGETS } from '../domain/world'
import { navigate } from '../router/history'
import { ErrorBoundary } from '../router/ErrorBoundary'
import { RouterProvider } from '../router/router'
import { deliverForTest, FEED_EVENTS, stopFeed } from '../state/feed'
import type { LedgerClient } from '../worker/client'
import type { LedgerOverview } from '../worker/protocol'
import { OverviewContent, shareText } from './overview/content'
import { notFound, routes } from './routes'

vi.mock('../worker/client', async () => {
  const { sharedLedgerClient: shared } = await import('../../tests/unit/fake-ledger-client')
  return { ledgerClient: shared.client }
})

interface OverviewCall {
  readonly account: AccountId | null
  readonly resolve: (overview: LedgerOverview) => void
  readonly reject: (reason: Error) => void
}

function deferredClient(): { readonly client: LedgerClient; readonly calls: OverviewCall[] } {
  const calls: OverviewCall[] = []
  const client: LedgerClient = {
    ...fakeClient().client,
    overview: (account) => new Promise<LedgerOverview>((resolve, reject) => {
      calls.push({ account, resolve, reject })
    }),
  }
  return { client, calls }
}

function overviewFor(account: AccountId | null, balance: number): LedgerOverview {
  const category = BUDGETS[0].categoryId
  return {
    balances: ACCOUNTS.filter((entry) => account === null || entry.id === account).map((entry) => ({
      accountId: entry.id,
      balance,
      currency: entry.currency,
      last30Days: [balance, balance],
    })),
    topCategories: [{ categoryId: category, monthToDate: 1_000, share: 0.004 }],
    latest: new Int32Array([0, 1]),
    months: [],
    currency: 'EUR',
  }
}

function call(calls: readonly OverviewCall[], index: number): OverviewCall {
  const found = calls[index]
  if (found === undefined) {
    throw new RangeError(`No overview call ${String(index)}`)
  }
  return found
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action()
    await Promise.resolve()
  })
}

function renderOverview(client: LedgerClient, path = '/') {
  navigate(path)
  return render(
    <RouterProvider routes={routes} notFound={notFound}>
      <ErrorBoundary pathname="/">
        <OverviewContent client={client} />
      </ErrorBoundary>
    </RouterProvider>,
  )
}

function root(container: HTMLElement): Element {
  const found = container.querySelector('[data-feed-version]')
  if (found === null) {
    throw new Error('No overview root')
  }
  return found
}

function dataSection(container: HTMLElement): Element {
  const found = container.querySelector('section[aria-busy]')
  if (found === null) {
    throw new Error('No overview data section')
  }
  return found
}

function tileCount(): number {
  return screen.queryAllByRole('img', { name: /^30-day balance/ }).length
}

afterEach(() => {
  stopFeed()
})

describe('OverviewContent', () => {
  it('requests the overview again for every feed event and records the version it reflects', async () => {
    const { client, calls } = deferredClient()
    const { container } = renderOverview(client)
    expect(calls).toHaveLength(1)
    await settle(() => {
      call(calls, 0).resolve(overviewFor(null, 100))
    })
    expect(root(container)).toHaveAttribute('data-feed-version', '0')

    act(() => {
      deliverForTest(FEED_EVENTS[0] ?? { sequence: 0, id: 0, offset: 0, status: 'booked' })
    })
    expect(calls).toHaveLength(2)
    expect(dataSection(container)).toHaveAttribute('aria-busy', 'true')
    await settle(() => {
      call(calls, 1).resolve(overviewFor(null, 200))
    })
    expect(root(container)).toHaveAttribute('data-feed-version', '1')
    expect(dataSection(container)).toHaveAttribute('aria-busy', 'false')
  })

  it('drops superseded responses when the scope goes A, B and back to A', async () => {
    const { client, calls } = deferredClient()
    renderOverview(client, '/?account=acc-main')
    act(() => {
      navigate('/?account=acc-ops')
    })
    act(() => {
      navigate('/?account=acc-main')
    })
    expect(calls.map((entry) => entry.account)).toEqual(['acc-main', 'acc-ops', 'acc-main'])

    await settle(() => {
      call(calls, 2).resolve(overviewFor('acc-main', 333))
    })
    await settle(() => {
      call(calls, 1).resolve(overviewFor('acc-ops', 222))
      call(calls, 0).resolve(overviewFor('acc-main', 111))
    })

    expect(screen.getByText(formatMoney(333, 'EUR'))).toBeInTheDocument()
    expect(screen.queryByText(formatMoney(111, 'EUR'))).not.toBeInTheDocument()
    expect(screen.queryByText(formatMoney(222, 'USD'))).not.toBeInTheDocument()
  })

  it('keeps the previous scope whole while the next one loads', async () => {
    const { client, calls } = deferredClient()
    const { container } = renderOverview(client)
    await settle(() => {
      call(calls, 0).resolve(overviewFor(null, 100))
    })
    expect(tileCount()).toBe(3)

    act(() => {
      navigate('/?account=acc-ops')
    })
    expect(dataSection(container)).toHaveAttribute('aria-busy', 'true')
    expect(tileCount()).toBe(3)

    await settle(() => {
      call(calls, 1).resolve(overviewFor('acc-ops', 500))
    })
    expect(dataSection(container)).toHaveAttribute('aria-busy', 'false')
    expect(tileCount()).toBe(1)
    expect(screen.getByText(formatMoney(500, 'USD'))).toBeInTheDocument()
  })

  it('rethrows a failed request to the error boundary', async () => {
    const { client, calls } = deferredClient()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderOverview(client)
    await settle(() => {
      call(calls, 0).reject(new Error('worker down'))
    })
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('shareText', () => {
  it('prints shares under half a percent as under one percent', () => {
    expect(shareText(0.004, 'en-GB')).toBe('<1%')
    expect(shareText(0.005, 'en-GB')).toBe('1%')
    expect(shareText(0.19, 'en-GB')).toBe('19%')
    expect(shareText(0, 'en-GB')).toBe('0%')
  })
})
