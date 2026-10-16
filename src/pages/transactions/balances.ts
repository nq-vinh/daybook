import { accountAmount, transaction } from '../../domain/transactions'
import { type AccountId, ACCOUNTS, type Currency } from '../../domain/world'
import { parseFilter } from '../../state/url'
import { hasNarrowingFilters } from './filters'

export interface LedgerResultView {
  readonly ids: Int32Array
  readonly balances: ReadonlyMap<number, number> | null
  readonly balanceCurrency: Currency | null
  readonly balanceKey: string | null
}

function runningBalances(ids: Int32Array, accountId: AccountId, newestFirst: boolean): ReadonlyMap<number, number> {
  const account = ACCOUNTS.find((candidate) => candidate.id === accountId)
  const balances = new Map<number, number>()
  let balance: number = account?.openingBalance ?? 0

  for (let step = 0; step < ids.length; step += 1) {
    const id = ids[newestFirst ? ids.length - 1 - step : step]
    if (id !== undefined) {
      balance += accountAmount(transaction(id))
      balances.set(id, balance)
    }
  }

  return balances
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
