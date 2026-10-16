import { forecast } from '../domain/forecast'
import { convert, RATES_PER_100_EUR, roundHalfAwayFromZero } from '../domain/fx'
import {
  type AccountSeries,
  COMPLETE_MONTHS,
  type MonthTotals,
  monthlySeriesByAccount,
  transaction,
  TRANSACTION_COUNT,
} from '../domain/transactions'
import {
  accountCurrency,
  type AccountId,
  ACCOUNTS,
  CARDS,
  CATEGORIES,
  COUNTERPARTIES,
  type CounterpartyId,
  type Currency,
  CURRENCIES,
  DAY_MS,
  type ExpenseCategoryId,
  monthStart,
  TODAY,
} from '../domain/world'
import { type FilterSort, type FilterState, isoDayEnd, isoDayStart, type SortColumn, STATUSES } from '../state/url'
import type {
  AccountBalance,
  BudgetSpend,
  CardSpend,
  CategoryEdit,
  CategoryShare,
  FeedSettlement,
  LedgerOverview,
  LedgerResult,
  LedgerSeries,
  OverviewMonth,
} from './protocol'

interface SortOrder {
  readonly ids: Int32Array
  readonly keys: ArrayLike<number>
}

export interface LedgerIndex {
  readonly size: number
  readonly bookedAt: Float64Array
  readonly amount: Int32Array
  readonly amountInEur: Int32Array
  readonly amountInAccount: Int32Array
  readonly account: Uint8Array
  readonly card: Uint8Array
  readonly counterparty: Uint8Array
  readonly currency: Uint8Array
  readonly status: Uint8Array
  readonly originalStatus: Uint8Array
  readonly category: Uint8Array
  readonly originalCategory: Uint8Array
  readonly haystack: readonly string[]
  readonly scratch: Int32Array
  readonly orders: Map<SortColumn, SortOrder>
}

const NO_CARD = 0
const DECLINED = STATUSES.indexOf('declined')
const SHARE_MONTHS = 3
const MONTH_TO_DATE_START = monthStart(COMPLETE_MONTHS)
const SHARE_START = monthStart(COMPLETE_MONTHS - SHARE_MONTHS)
const BALANCE_DAYS = 30
const CHART_MONTHS = 12
const FORECAST_MONTHS = 3
const TOP_CATEGORIES = 5
const LATEST_COUNT = 10
const EXPENSE_CATEGORIES = CATEGORIES.filter(
  (entry): entry is Extract<(typeof CATEGORIES)[number], { kind: 'expense' }> => entry.kind === 'expense',
).map((entry) => entry.id)

function codes(ids: readonly string[], offset = 0): ReadonlyMap<string, number> {
  return new Map(ids.map((id, position) => [id, position + offset]))
}

const ACCOUNT_CODES = codes(ACCOUNTS.map((account) => account.id))
const CARD_CODES = codes(CARDS.map((card) => card.id), 1)
const COUNTERPARTY_CODES = codes(COUNTERPARTIES.map((counterparty) => counterparty.id))
const CATEGORY_CODES = codes(CATEGORIES.map((category) => category.id))
const STATUS_CODES = codes(STATUSES)
const CURRENCY_CODES = codes(CURRENCIES)

function ranksBy(labels: readonly string[]): Uint8Array {
  const ranks = new Uint8Array(labels.length)
  const sorted = labels.map((label, code) => ({ label, code })).sort((left, right) => left.label.localeCompare(right.label, 'en'))
  sorted.forEach(({ code }, rank) => {
    ranks[code] = rank
  })
  return ranks
}

const COUNTERPARTY_RANKS = ranksBy(COUNTERPARTIES.map((counterparty) => counterparty.name))
const CATEGORY_RANKS = ranksBy(CATEGORIES.map((category) => category.label))

function codeOf(table: ReadonlyMap<string, number>, id: string): number {
  const code = table.get(id)
  if (code === undefined) {
    throw new RangeError(`Unknown ledger id: ${id}`)
  }
  return code
}

export function buildLedgerIndex(size = TRANSACTION_COUNT): LedgerIndex {
  const bookedAt = new Float64Array(size)
  const amount = new Int32Array(size)
  const amountInEur = new Int32Array(size)
  const amountInAccount = new Int32Array(size)
  const account = new Uint8Array(size)
  const card = new Uint8Array(size)
  const counterparty = new Uint8Array(size)
  const currency = new Uint8Array(size)
  const status = new Uint8Array(size)
  const category = new Uint8Array(size)
  const haystack = new Array<string>(size)

  for (let id = 0; id < size; id += 1) {
    const entry = transaction(id)
    const counterpartyCode = codeOf(COUNTERPARTY_CODES, entry.counterpartyId)
    bookedAt[id] = entry.bookedAt
    amount[id] = entry.amount
    amountInEur[id] = convert(entry.amount, entry.currency, 'EUR')
    amountInAccount[id] = convert(entry.amount, entry.currency, accountCurrency(entry.accountId))
    account[id] = codeOf(ACCOUNT_CODES, entry.accountId)
    card[id] = entry.cardId === undefined ? NO_CARD : codeOf(CARD_CODES, entry.cardId)
    counterparty[id] = counterpartyCode
    currency[id] = codeOf(CURRENCY_CODES, entry.currency)
    status[id] = codeOf(STATUS_CODES, entry.status)
    category[id] = codeOf(CATEGORY_CODES, entry.category)
    haystack[id] = `${COUNTERPARTIES[counterpartyCode]?.name ?? ''} ${entry.reference}`.toLowerCase()
  }

  return {
    size,
    bookedAt,
    amount,
    amountInEur,
    amountInAccount,
    account,
    card,
    counterparty,
    currency,
    status,
    originalStatus: status.slice(),
    category,
    originalCategory: category.slice(),
    haystack,
    scratch: new Int32Array(size),
    orders: new Map(),
  }
}

function rankedColumn(column: Uint8Array, ranks: Uint8Array): Uint8Array {
  return column.map((code) => ranks[code] ?? 0)
}

function normalisedAmounts(index: LedgerIndex): Float64Array {
  const keys = new Float64Array(index.size)
  for (let id = 0; id < index.size; id += 1) {
    const code = CURRENCIES[index.currency[id] ?? 0] ?? 'EUR'
    keys[id] = (index.amount[id] ?? 0) / RATES_PER_100_EUR[code]
  }
  return keys
}

function sortKeys(index: LedgerIndex, column: SortColumn): ArrayLike<number> {
  switch (column) {
    case 'bookedAt':
      return index.bookedAt
    case 'amount':
      return normalisedAmounts(index)
    case 'counterparty':
      return rankedColumn(index.counterparty, COUNTERPARTY_RANKS)
    case 'category':
      return rankedColumn(index.category, CATEGORY_RANKS)
    case 'status':
      return index.status
  }
}

export function sortOrder(index: LedgerIndex, column: SortColumn): SortOrder {
  const cached = index.orders.get(column)
  if (cached !== undefined) {
    return cached
  }

  const keys = sortKeys(index, column)
  const ids = new Int32Array(index.size)
  for (let id = 0; id < index.size; id += 1) {
    ids[id] = id
  }
  ids.sort((left, right) => (keys[left] ?? 0) - (keys[right] ?? 0) || left - right)

  const order = { ids, keys }
  index.orders.set(column, order)
  return order
}

function visitInOrder(index: LedgerIndex, sort: FilterSort, visit: (id: number) => boolean): void {
  const { ids, keys } = sortOrder(index, sort.column)

  if (sort.dir === 'asc') {
    for (let position = 0; position < ids.length; position += 1) {
      if (!visit(ids[position] ?? 0)) {
        return
      }
    }
    return
  }

  let end = ids.length - 1
  while (end >= 0) {
    const key = keys[ids[end] ?? 0]
    let start = end
    while (start > 0 && keys[ids[start - 1] ?? 0] === key) {
      start -= 1
    }
    for (let position = start; position <= end; position += 1) {
      if (!visit(ids[position] ?? 0)) {
        return
      }
    }
    end = start - 1
  }
}

function mask(size: number, ids: readonly string[], table: ReadonlyMap<string, number>): Uint8Array | null {
  if (ids.length === 0) {
    return null
  }
  const selected = new Uint8Array(size)
  for (const id of ids) {
    const code = table.get(id)
    if (code !== undefined) {
      selected[code] = 1
    }
  }
  return selected
}

export function queryLedger(index: LedgerIndex, filter: FilterState): LedgerResult {
  const accountCode = filter.account === null ? -1 : codeOf(ACCOUNT_CODES, filter.account)
  const currency: Currency = filter.account === null ? 'EUR' : accountCurrency(filter.account)
  const displayAmount = filter.account === null ? index.amountInEur : index.amountInAccount
  const categories = mask(CATEGORIES.length, filter.cat, CATEGORY_CODES)
  const cards = mask(CARDS.length + 1, filter.card, CARD_CODES)
  const statuses = mask(STATUSES.length, filter.status, STATUS_CODES)
  const [firstDay, lastDay] = filter.from !== null && filter.to !== null && filter.from > filter.to
    ? [filter.to, filter.from]
    : [filter.from, filter.to]
  const from = firstDay === null ? Number.NEGATIVE_INFINITY : isoDayStart(firstDay)
  const to = lastDay === null ? Number.POSITIVE_INFINITY : isoDayEnd(lastDay)
  const min = filter.min !== null && filter.max !== null ? Math.min(filter.min, filter.max) : filter.min ?? 0
  const max = filter.min !== null && filter.max !== null
    ? Math.max(filter.min, filter.max)
    : filter.max ?? Number.POSITIVE_INFINITY
  const words = filter.q.toLowerCase().split(/\s+/).filter((word) => word !== '')
  const output = index.scratch
  let count = 0
  let debits = 0
  let credits = 0

  visitInOrder(index, filter.sort, (id) => {
    if (accountCode >= 0 && index.account[id] !== accountCode) {
      return true
    }
    if (categories !== null && categories[index.category[id] ?? 0] !== 1) {
      return true
    }
    if (cards !== null && cards[index.card[id] ?? NO_CARD] !== 1) {
      return true
    }
    const status = index.status[id] ?? 0
    if (statuses !== null && statuses[status] !== 1) {
      return true
    }
    const bookedAt = index.bookedAt[id] ?? 0
    if (bookedAt < from || bookedAt >= to) {
      return true
    }
    const value = displayAmount[id] ?? 0
    const magnitude = Math.abs(value)
    if (magnitude < min || magnitude > max) {
      return true
    }
    if (words.length > 0) {
      const haystack = index.haystack[id] ?? ''
      if (!words.every((word) => haystack.includes(word))) {
        return true
      }
    }

    output[count] = id
    count += 1
    if (status !== DECLINED) {
      if (value < 0) {
        debits -= value
      } else {
        credits += value
      }
    }
    return true
  })

  return {
    ids: output.slice(0, count),
    totals: { count, debits, credits, net: credits - debits, currency },
  }
}

export function applyCategoryEdits(index: LedgerIndex, edits: readonly CategoryEdit[]): void {
  index.category.set(index.originalCategory)
  for (const [id, categoryId] of edits) {
    const code = CATEGORY_CODES.get(categoryId)
    if (Number.isInteger(id) && id >= 0 && id < index.size && code !== undefined) {
      index.category[id] = code
    }
  }
  index.orders.delete('category')
}

export function applyFeedSettlements(index: LedgerIndex, settled: readonly FeedSettlement[]): void {
  index.status.set(index.originalStatus)
  for (const [id, status] of settled) {
    const code = STATUS_CODES.get(status)
    if (Number.isInteger(id) && id >= 0 && id < index.size && code !== undefined) {
      index.status[id] = code
    }
  }
  index.orders.delete('status')
}

function isSpend(index: LedgerIndex, id: number): boolean {
  return index.status[id] !== DECLINED && (index.amount[id] ?? 0) < 0
}

export function cardSpend(index: LedgerIndex): CardSpend[] {
  const totals = new Array<number>(CARDS.length + 1).fill(0)
  for (let id = 0; id < index.size; id += 1) {
    const card = index.card[id] ?? NO_CARD
    if (card !== NO_CARD && (index.bookedAt[id] ?? 0) >= MONTH_TO_DATE_START && isSpend(index, id)) {
      totals[card] = (totals[card] ?? 0) - (index.amountInAccount[id] ?? 0)
    }
  }
  return CARDS.map((card) => ({
    cardId: card.id,
    monthToDate: totals[codeOf(CARD_CODES, card.id)] ?? 0,
    currency: accountCurrency(card.accountId),
  }))
}

export function budgetSpend(index: LedgerIndex, monthEndExpense: number): BudgetSpend[] {
  const monthToDate = new Array<number>(CATEGORIES.length).fill(0)
  const recent = new Array<number>(CATEGORIES.length).fill(0)
  for (let id = 0; id < index.size; id += 1) {
    const bookedAt = index.bookedAt[id] ?? 0
    if (bookedAt >= SHARE_START && isSpend(index, id)) {
      const category = index.category[id] ?? 0
      const totals = bookedAt >= MONTH_TO_DATE_START ? monthToDate : recent
      totals[category] = (totals[category] ?? 0) - (index.amountInEur[id] ?? 0)
    }
  }
  const codesOf = EXPENSE_CATEGORIES.map((categoryId) => codeOf(CATEGORY_CODES, categoryId))
  const recentTotal = codesOf.reduce((sum, code) => sum + (recent[code] ?? 0), 0)
  return EXPENSE_CATEGORIES.map((categoryId: ExpenseCategoryId, position) => {
    const code = codesOf[position] ?? 0
    const share = recentTotal === 0 ? 0 : (recent[code] ?? 0) / recentTotal
    return {
      categoryId,
      monthToDate: monthToDate[code] ?? 0,
      share,
      projected: roundHalfAwayFromZero(monthEndExpense * share),
    }
  })
}

export function counterpartyHistory(
  index: LedgerIndex,
  counterpartyId: CounterpartyId,
  limit: number,
  exclude: number,
): Int32Array<ArrayBuffer> {
  const code = codeOf(COUNTERPARTY_CODES, counterpartyId)
  const capacity = Number.isSafeInteger(limit) ? Math.max(0, Math.min(limit, index.size)) : 0
  const ids = new Int32Array(capacity)
  let count = 0

  if (capacity > 0) {
    visitInOrder(index, { column: 'bookedAt', dir: 'desc' }, (id) => {
      if (id !== exclude && index.counterparty[id] === code) {
        ids[count] = id
        count += 1
      }
      return count < capacity
    })
  }

  return count === capacity ? ids : ids.slice(0, count)
}

let seriesByAccount: Record<AccountId, AccountSeries> | null = null

export function ledgerSeries(accountId: AccountId | null): LedgerSeries {
  seriesByAccount ??= monthlySeriesByAccount()
  const cache = seriesByAccount

  if (accountId !== null) {
    return { ...cache[accountId], currency: accountCurrency(accountId) }
  }

  const parts = ACCOUNTS.map((account) => ({ series: cache[account.id], currency: account.currency }))
  const total = (read: (series: AccountSeries) => number): number => parts.reduce(
    (sum, part) => sum + convert(read(part.series), part.currency, 'EUR'),
    0,
  )
  const monthly = (field: 'income' | 'expense' | 'net'): number[] => Array.from(
    { length: COMPLETE_MONTHS },
    (_, month) => total((series) => series[field][month] ?? 0),
  )

  return {
    income: monthly('income'),
    expense: monthly('expense'),
    net: monthly('net'),
    monthToDate: {
      income: total((series) => series.monthToDate.income),
      expense: total((series) => series.monthToDate.expense),
      net: total((series) => series.monthToDate.net),
    },
    currency: 'EUR',
  }
}

export function monthEndExpense(): number {
  return forecast(ledgerSeries(null)).expense[0] ?? 0
}

export function overviewMonths(series: LedgerSeries, monthToDate: MonthTotals = series.monthToDate): OverviewMonth[] {
  const first = COMPLETE_MONTHS - CHART_MONTHS
  const complete = Array.from({ length: CHART_MONTHS }, (_, offset): OverviewMonth => ({
    start: monthStart(first + offset),
    income: series.income[first + offset] ?? 0,
    expense: series.expense[first + offset] ?? 0,
    net: series.net[first + offset] ?? 0,
    kind: 'complete',
  }))
  const current: OverviewMonth = { start: monthStart(COMPLETE_MONTHS), ...monthToDate, kind: 'current' }
  const ahead = forecast(series, FORECAST_MONTHS + 1)
  const projected = Array.from({ length: FORECAST_MONTHS }, (_, offset): OverviewMonth => ({
    start: monthStart(COMPLETE_MONTHS + 1 + offset),
    income: ahead.income[offset + 1] ?? 0,
    expense: ahead.expense[offset + 1] ?? 0,
    net: ahead.net[offset + 1] ?? 0,
    kind: 'forecast',
  }))
  return [...complete, current, ...projected]
}

function balanceDay(bookedAt: number): number {
  return Math.min(BALANCE_DAYS, Math.max(1, Math.ceil(BALANCE_DAYS - (TODAY - bookedAt) / DAY_MS)))
}

export function accountBalances(index: LedgerIndex, accountId: AccountId | null): AccountBalance[] {
  const scoped = accountId === null ? ACCOUNTS : ACCOUNTS.filter((account) => account.id === accountId)
  const windowStart = TODAY - BALANCE_DAYS * DAY_MS
  const bases = ACCOUNTS.map((account): number => account.openingBalance)
  const deltas = ACCOUNTS.map(() => new Array<number>(BALANCE_DAYS + 1).fill(0))

  for (let id = 0; id < index.size; id += 1) {
    const bookedAt = index.bookedAt[id] ?? 0
    if (bookedAt > TODAY || index.status[id] === DECLINED) {
      continue
    }
    const account = index.account[id] ?? 0
    const value = index.amountInAccount[id] ?? 0
    const days = deltas[account]
    if (bookedAt <= windowStart || days === undefined) {
      bases[account] = (bases[account] ?? 0) + value
    } else {
      const day = balanceDay(bookedAt)
      days[day] = (days[day] ?? 0) + value
    }
  }

  return scoped.map((account) => {
    const code = codeOf(ACCOUNT_CODES, account.id)
    let running = bases[code] ?? 0
    const last30Days = (deltas[code] ?? []).map((delta) => {
      running += delta
      return running
    })
    return { accountId: account.id, balance: running, currency: account.currency, last30Days }
  })
}

export function currentMonthTotals(index: LedgerIndex, accountId: AccountId | null): MonthTotals {
  const income = new Array<number>(ACCOUNTS.length).fill(0)
  const expense = new Array<number>(ACCOUNTS.length).fill(0)
  for (let id = 0; id < index.size; id += 1) {
    if ((index.bookedAt[id] ?? 0) >= MONTH_TO_DATE_START && index.status[id] !== DECLINED) {
      const account = index.account[id] ?? 0
      const value = index.amountInAccount[id] ?? 0
      if (value >= 0) {
        income[account] = (income[account] ?? 0) + value
      } else {
        expense[account] = (expense[account] ?? 0) - value
      }
    }
  }
  const scoped = ACCOUNTS.filter((account) => accountId === null || account.id === accountId)
  const currency: Currency = accountId === null ? 'EUR' : accountCurrency(accountId)
  const total = (column: readonly number[]): number => scoped.reduce(
    (sum, account) => sum + convert(column[codeOf(ACCOUNT_CODES, account.id)] ?? 0, account.currency, currency),
    0,
  )
  const net = income.map((value, account) => value - (expense[account] ?? 0))
  return { income: total(income), expense: total(expense), net: total(net) }
}

export function topCategories(index: LedgerIndex, accountId: AccountId | null): CategoryShare[] {
  const accountCode = accountId === null ? -1 : codeOf(ACCOUNT_CODES, accountId)
  const amounts = accountId === null ? index.amountInEur : index.amountInAccount
  const totals = new Array<number>(CATEGORIES.length).fill(0)
  for (let id = 0; id < index.size; id += 1) {
    const bookedAt = index.bookedAt[id] ?? 0
    if (
      bookedAt >= MONTH_TO_DATE_START
      && bookedAt <= TODAY
      && (accountCode < 0 || index.account[id] === accountCode)
      && isSpend(index, id)
    ) {
      const category = index.category[id] ?? 0
      totals[category] = (totals[category] ?? 0) - (amounts[id] ?? 0)
    }
  }
  const spent = EXPENSE_CATEGORIES.map((categoryId) => ({ categoryId, monthToDate: totals[codeOf(CATEGORY_CODES, categoryId)] ?? 0 }))
  const total = spent.reduce((sum, entry) => sum + entry.monthToDate, 0)
  return spent
    .filter((entry) => entry.monthToDate > 0)
    .sort((left, right) => right.monthToDate - left.monthToDate || left.categoryId.localeCompare(right.categoryId, 'en'))
    .slice(0, TOP_CATEGORIES)
    .map((entry) => ({ ...entry, share: total === 0 ? 0 : entry.monthToDate / total }))
}

export function latestIds(index: LedgerIndex, accountId: AccountId | null, limit = LATEST_COUNT): Int32Array<ArrayBuffer> {
  const accountCode = accountId === null ? -1 : codeOf(ACCOUNT_CODES, accountId)
  const ids = new Int32Array(limit)
  let count = 0
  visitInOrder(index, { column: 'bookedAt', dir: 'desc' }, (id) => {
    if (
      (index.bookedAt[id] ?? 0) <= TODAY
      && index.status[id] !== DECLINED
      && (accountCode < 0 || index.account[id] === accountCode)
    ) {
      ids[count] = id
      count += 1
    }
    return count < limit
  })
  return count === limit ? ids : ids.slice(0, count)
}

export function overview(index: LedgerIndex, accountId: AccountId | null): LedgerOverview {
  const series = ledgerSeries(accountId)
  return {
    balances: accountBalances(index, accountId),
    topCategories: topCategories(index, accountId),
    latest: latestIds(index, accountId),
    months: overviewMonths(series, currentMonthTotals(index, accountId)),
    currency: series.currency,
  }
}
