import { accountAmount, transaction } from '../../domain/transactions'
import { type AccountId, ACCOUNTS, type Currency } from '../../domain/world'
import { type FeedEvent, getEvents, getRowOverride, subscribeEvents } from '../../state/feed'
import { parseFilter } from '../../state/url'
import { hasNarrowingFilters } from './filters'

export interface BalanceRows {
  readonly subscribe: (id: number, listener: () => void) => () => void
  readonly get: (id: number) => number | undefined
}

export interface LedgerResultView {
  readonly ids: Int32Array
  readonly balances: BalanceRows | null
  readonly balanceCurrency: Currency | null
  readonly balanceKey: string | null
}

export function runningBalances(ids: Int32Array, accountId: AccountId, newestFirst: boolean): BalanceRows {
  const opening = ACCOUNTS.find((candidate) => candidate.id === accountId)?.openingBalance ?? 0
  const order = Int32Array.from({ length: ids.length }, (_, step) => ids[newestFirst ? ids.length - 1 - step : step] ?? 0)
  const amounts = Float64Array.from(order, (id) => accountAmount(transaction(id)))
  const listeners = new Map<number, Set<() => void>>()
  let balances: ReadonlyMap<number, number> = new Map()
  let computedFor: readonly FeedEvent[] | null = null
  let unsubscribeFeed: (() => void) | null = null

  function current(): ReadonlyMap<number, number> {
    const events = getEvents()
    if (events !== computedFor) {
      computedFor = events
      const next = new Map<number, number>()
      let balance = opening
      order.forEach((id, position) => {
        balance += getRowOverride(id) === 'declined' ? 0 : (amounts[position] ?? 0)
        next.set(id, balance)
      })
      balances = next
    }
    return balances
  }

  function settle(): void {
    const previous = balances
    const next = current()
    for (const [id, registered] of listeners) {
      if (previous.get(id) !== next.get(id)) {
        for (const listener of [...registered]) {
          listener()
        }
      }
    }
  }

  return {
    subscribe(id, listener) {
      current()
      unsubscribeFeed ??= subscribeEvents(settle)
      const registered = listeners.get(id) ?? new Set<() => void>()
      listeners.set(id, registered)
      registered.add(listener)
      return () => {
        registered.delete(listener)
        if (registered.size === 0 && listeners.get(id) === registered) {
          listeners.delete(id)
        }
        if (listeners.size === 0) {
          unsubscribeFeed?.()
          unsubscribeFeed = null
        }
      }
    },
    get(id) {
      return current().get(id)
    },
  }
}

export function balanceKey(landedSearch: string | null): string | null {
  const filter = parseFilter(landedSearch ?? '')
  const { account, sort } = filter

  if (landedSearch === null || account === null || sort.column !== 'bookedAt' || hasNarrowingFilters(filter)) {
    return null
  }
  return `${account}:${sort.dir}`
}

export function resultView(ids: Int32Array, landedSearch: string | null): LedgerResultView {
  const key = balanceKey(landedSearch)
  const { account, sort } = parseFilter(landedSearch ?? '')

  if (key === null || account === null) {
    return { ids, balances: null, balanceCurrency: null, balanceKey: null }
  }

  const currency = ACCOUNTS.find((candidate) => candidate.id === account)?.currency ?? null
  return { ids, balances: runningBalances(ids, account, sort.dir === 'desc'), balanceCurrency: currency, balanceKey: key }
}
