import type { AccountSeries } from '../domain/transactions'
import type { AccountId, CategoryId, CounterpartyId, Currency } from '../domain/world'
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

export type LedgerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'result'; readonly requestId: number; readonly ids: Int32Array<ArrayBuffer>; readonly totals: LedgerTotals }
  | { readonly type: 'history'; readonly requestId: number; readonly ids: Int32Array<ArrayBuffer> }
  | { readonly type: 'series'; readonly requestId: number; readonly series: LedgerSeries }

export function assertNever(value: never): never {
  throw new TypeError(`Unhandled ledger message: ${JSON.stringify(value)}`)
}
