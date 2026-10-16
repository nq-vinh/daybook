import type { AccountSeries } from '../domain/transactions'
import type { AccountId, CardId, CategoryId, CounterpartyId, Currency, ExpenseCategoryId } from '../domain/world'
import type { FilterState } from '../state/url'

export interface LedgerTotals {
  readonly count: number
  readonly debits: number
  readonly credits: number
  readonly net: number
  readonly currency: Currency
}

export interface LedgerResult {
  readonly ids: Int32Array<ArrayBuffer>
  readonly totals: LedgerTotals
}

export interface LedgerSeries extends AccountSeries {
  readonly currency: Currency
}

export type CategoryEdit = readonly [id: number, category: CategoryId]

export type SettledStatus = 'booked' | 'declined'

export type FeedSettlement = readonly [id: number, status: SettledStatus]

export interface CardSpend {
  readonly cardId: CardId
  readonly monthToDate: number
  readonly currency: Currency
}

export interface BudgetSpend {
  readonly categoryId: ExpenseCategoryId
  readonly monthToDate: number
  readonly share: number
}

export type LedgerRequest =
  | { readonly type: 'query'; readonly requestId: number; readonly filter: FilterState }
  | {
    readonly type: 'history'
    readonly requestId: number
    readonly counterpartyId: CounterpartyId
    readonly limit: number
    readonly exclude: number
  }
  | { readonly type: 'series'; readonly requestId: number; readonly accountId: AccountId | null }
  | { readonly type: 'edits'; readonly categories: readonly CategoryEdit[] }
  | { readonly type: 'feed'; readonly settled: readonly FeedSettlement[] }
  | { readonly type: 'cards'; readonly requestId: number }
  | { readonly type: 'budgets'; readonly requestId: number }

export type LedgerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'result'; readonly requestId: number; readonly ids: Int32Array<ArrayBuffer>; readonly totals: LedgerTotals }
  | { readonly type: 'history'; readonly requestId: number; readonly ids: Int32Array<ArrayBuffer> }
  | { readonly type: 'series'; readonly requestId: number; readonly series: LedgerSeries }
  | { readonly type: 'cards'; readonly requestId: number; readonly cards: readonly CardSpend[] }
  | { readonly type: 'budgets'; readonly requestId: number; readonly budgets: readonly BudgetSpend[] }

export function assertNever(value: never): never {
  throw new TypeError(`Unhandled ledger message: ${JSON.stringify(value)}`)
}
