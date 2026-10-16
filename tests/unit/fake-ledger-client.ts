import { accountCurrency, BUDGETS, CARDS } from '../../src/domain/world'
import type { FilterState } from '../../src/state/url'
import type { LedgerClient } from '../../src/worker/client'
import type { BudgetSpend, CardSpend, LedgerResult } from '../../src/worker/protocol'

export interface PendingQuery {
  readonly filter: FilterState
  readonly channel: string
  readonly resolve: (result: LedgerResult | null) => void
  readonly reject: (reason: Error) => void
  settled: boolean
}

export interface FakeLedgerClient {
  readonly client: LedgerClient
  readonly calls: PendingQuery[]
}

const ZERO_CARDS: readonly CardSpend[] = CARDS.map((card) => ({ cardId: card.id, monthToDate: 0, currency: accountCurrency(card.accountId) }))

const ZERO_BUDGETS: readonly BudgetSpend[] = BUDGETS.map((budget) => ({ categoryId: budget.categoryId, monthToDate: 0, share: 0, projected: 0 }))

export interface FakeClientOptions {
  readonly supersede?: boolean
  readonly cards?: readonly CardSpend[]
  readonly budgets?: readonly BudgetSpend[]
}

export function fakeClient({ supersede = true, cards, budgets }: FakeClientOptions = {}): FakeLedgerClient {
  const calls: PendingQuery[] = []
  const client: LedgerClient = {
    query: (filter, channel) => {
      for (const earlier of calls) {
        if (supersede && earlier.channel === channel && !earlier.settled) {
          earlier.settled = true
          earlier.resolve(null)
        }
      }
      return new Promise((resolve, reject) => {
        calls.push({ filter, channel, resolve, reject, settled: false })
      })
    },
    history: () => Promise.resolve(new Int32Array(0)),
    series: () => Promise.reject(new Error('Series is not used here.')),
    cards: () => Promise.resolve(cards ?? ZERO_CARDS),
    budgets: () => Promise.resolve(budgets ?? ZERO_BUDGETS),
    overview: () => Promise.reject(new Error('Overview is not used here.')),
    setEdits: () => undefined,
    setFeed: () => undefined,
    ready: () => Promise.resolve(),
    terminate: () => undefined,
  }
  return { client, calls }
}

export const sharedLedgerClient = fakeClient()
