// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest'

import { convert, RATES_PER_100_EUR } from '../domain/fx'
import { COMPLETE_MONTHS, monthlySeriesByAccount, type Transaction, transaction, TRANSACTION_COUNT } from '../domain/transactions'
import { accountCurrency, CARDS, CATEGORIES, COUNTERPARTIES, DAY_MS, monthStart } from '../domain/world'
import { DEFAULT_FILTER, type FilterState, isoDayStart } from '../state/url'
import {
  applyCategoryEdits,
  applyFeedSettlements,
  budgetSpend,
  buildLedgerIndex,
  cardSpend,
  counterpartyHistory,
  type LedgerIndex,
  ledgerSeries,
  queryLedger,
} from './index'

let index: LedgerIndex
let rows: Transaction[]

beforeAll(() => {
  index = buildLedgerIndex()
  rows = Array.from({ length: TRANSACTION_COUNT }, (_, id) => transaction(id))
})

function row(id: number): Transaction {
  const entry = rows[id]
  if (entry === undefined) {
    throw new RangeError(`No row ${String(id)}`)
  }
  return entry
}

function displayAmount(entry: Transaction, filter: FilterState): number {
  return convert(entry.amount, entry.currency, filter.account === null ? 'EUR' : accountCurrency(filter.account))
}

function reference(filter: FilterState): Transaction[] {
  const words = filter.q.toLowerCase().split(/\s+/).filter((word) => word !== '')
  return rows.filter((entry) => {
    const magnitude = Math.abs(displayAmount(entry, filter))
    const counterparty = COUNTERPARTIES.find((candidate) => candidate.id === entry.counterpartyId)?.name ?? ''
    return (filter.account === null || entry.accountId === filter.account)
      && (filter.cat.length === 0 || filter.cat.includes(entry.category))
      && (filter.card.length === 0 || (entry.cardId !== undefined && filter.card.includes(entry.cardId)))
      && (filter.status.length === 0 || filter.status.includes(entry.status))
      && (filter.from === null || entry.bookedAt >= isoDayStart(filter.from))
      && (filter.to === null || entry.bookedAt < isoDayStart(filter.to) + DAY_MS)
      && (filter.min === null || magnitude >= filter.min)
      && (filter.max === null || magnitude <= filter.max)
      && words.every((word) => `${counterparty} ${entry.reference}`.toLowerCase().includes(word))
  })
}

function sortedIds(entries: readonly Transaction[], key: (entry: Transaction) => number, dir: 'asc' | 'desc'): number[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => sign * (key(left) - key(right)) || left.id - right.id).map((entry) => entry.id)
}

describe('buildLedgerIndex', () => {
  it('indexes every transaction into typed columns', () => {
    expect(index.size).toBe(TRANSACTION_COUNT)
    expect(index.bookedAt).toBeInstanceOf(Float64Array)
    expect(index.amount[4_321]).toBe(row(4_321).amount)
    expect(index.amountInEur[4_321]).toBe(convert(row(4_321).amount, row(4_321).currency, 'EUR'))
    expect(index.haystack[4_321]).toContain(row(4_321).reference.toLowerCase())
  })

  it('keeps every amount inside the Int32 range', () => {
    const largest = rows.reduce((max, entry) => Math.max(max, Math.abs(entry.amount)), 0)
    expect(largest).toBeLessThan(2 ** 31)
  })
})

describe('queryLedger', () => {
  it('returns every id by booked date descending by default', () => {
    const { ids, totals } = queryLedger(index, DEFAULT_FILTER)

    expect(ids).toHaveLength(TRANSACTION_COUNT)
    expect(ids.buffer.byteLength).toBe(TRANSACTION_COUNT * 4)
    expect([...ids]).toEqual(sortedIds(rows, (entry) => entry.bookedAt, 'desc'))
    expect(totals.count).toBe(TRANSACTION_COUNT)
    expect(totals.currency).toBe('EUR')
  })

  it('matches a brute-force filter for account, categories, cards, status, dates and amount', () => {
    const filters: FilterState[] = [
      { ...DEFAULT_FILTER, account: 'acc-ops', from: '2025-01-01', to: '2025-06-30', min: 10_000, max: 250_000 },
      { ...DEFAULT_FILTER, cat: ['software', 'travel'], status: ['pending', 'declined'] },
      { ...DEFAULT_FILTER, card: ['card-01', 'card-07'], q: '  CARD PAY ' },
      { ...DEFAULT_FILTER, q: 'inv-', cat: ['revenue'] },
      { ...DEFAULT_FILTER, account: 'acc-uk', cat: ['revenue'], to: '2024-03-31' },
    ]

    for (const filter of filters) {
      const expected = reference(filter)
      expect(expected.length).toBeGreaterThan(0)
      expect([...queryLedger(index, filter).ids]).toEqual(sortedIds(expected, (entry) => entry.bookedAt, 'desc'))
    }
  })

  it('includes both ends of the date range', () => {
    const day = '2026-09-01'
    const { ids } = queryLedger(index, { ...DEFAULT_FILTER, from: day, to: day })
    const expected = rows.filter((entry) => entry.bookedAt >= isoDayStart(day) && entry.bookedAt < isoDayStart(day) + DAY_MS)

    expect(ids.length).toBe(expected.length)
    expect(expected.length).toBeGreaterThan(0)
  })

  it('sorts by amount, counterparty and status with id ascending inside ties in both directions', () => {
    const filter: FilterState = { ...DEFAULT_FILTER, account: 'acc-main', from: '2026-08-01' }
    const expected = reference(filter)
    const counterpartyName = (entry: Transaction): string => COUNTERPARTIES.find((candidate) => candidate.id === entry.counterpartyId)?.name ?? ''
    const names = [...new Set(expected.map(counterpartyName))].sort((left, right) => left.localeCompare(right, 'en'))
    const statuses = ['booked', 'pending', 'declined']

    for (const dir of ['asc', 'desc'] as const) {
      expect([...queryLedger(index, { ...filter, sort: { column: 'amount', dir } }).ids])
        .toEqual(sortedIds(expected, (entry) => entry.amount / RATES_PER_100_EUR[entry.currency], dir))
      expect([...queryLedger(index, { ...filter, sort: { column: 'counterparty', dir } }).ids])
        .toEqual(sortedIds(expected, (entry) => names.indexOf(counterpartyName(entry)), dir))
      expect([...queryLedger(index, { ...filter, sort: { column: 'status', dir } }).ids])
        .toEqual(sortedIds(expected, (entry) => statuses.indexOf(entry.status), dir))
    }
  })

  it('orders reversed amount and date bounds before filtering', () => {
    const amounts = queryLedger(index, { ...DEFAULT_FILTER, min: 5_000, max: 100_000 }).ids
    const dates = queryLedger(index, { ...DEFAULT_FILTER, from: '2026-01-01', to: '2026-01-31' }).ids

    expect(amounts.length).toBeGreaterThan(0)
    expect(dates.length).toBeGreaterThan(0)
    expect([...queryLedger(index, { ...DEFAULT_FILTER, min: 100_000, max: 5_000 }).ids]).toEqual([...amounts])
    expect([...queryLedger(index, { ...DEFAULT_FILTER, from: '2026-01-31', to: '2026-01-01' }).ids]).toEqual([...dates])
  })

  it('requires every search word in any order, ignoring repeated whitespace', () => {
    const twoWords = [...queryLedger(index, { ...DEFAULT_FILTER, q: 'card  pay' }).ids]
    const reversed = [...queryLedger(index, { ...DEFAULT_FILTER, q: 'PAY card' }).ids]
    const phrase = [...queryLedger(index, { ...DEFAULT_FILTER, q: 'card pay' }).ids]
    const counterpartyAndReference = reference({ ...DEFAULT_FILTER, q: 'okapi invoice' })

    expect(twoWords.length).toBeGreaterThan(0)
    expect(counterpartyAndReference.length).toBeGreaterThan(0)
    expect(twoWords).toEqual(phrase)
    expect(reversed).toEqual(phrase)
    expect([...queryLedger(index, { ...DEFAULT_FILTER, q: 'invoice okapi' }).ids])
      .toEqual(sortedIds(counterpartyAndReference, (entry) => entry.bookedAt, 'desc'))
  })

  it('sorts by category label in both directions and follows the edits overlay', () => {
    const filter: FilterState = { ...DEFAULT_FILTER, account: 'acc-uk', from: '2026-06-01' }
    const labels = [...CATEGORIES].sort((left, right) => left.label.localeCompare(right.label, 'en')).map((category) => category.id)
    const rank = (categoryId: string): number => labels.findIndex((candidate) => candidate === categoryId)
    const expected = reference(filter)

    for (const dir of ['asc', 'desc'] as const) {
      expect([...queryLedger(index, { ...filter, sort: { column: 'category', dir } }).ids])
        .toEqual(sortedIds(expected, (entry) => rank(entry.category), dir))
    }

    const target = expected.find((entry) => entry.category !== 'utilities')
    if (target === undefined) {
      throw new Error('No transaction to recategorise.')
    }
    applyCategoryEdits(index, [[target.id, 'utilities']])
    const edited = (entry: Transaction): string => (entry.id === target.id ? 'utilities' : entry.category)

    expect([...queryLedger(index, { ...filter, sort: { column: 'category', dir: 'asc' } }).ids])
      .toEqual(sortedIds(expected, (entry) => rank(edited(entry)), 'asc'))

    applyCategoryEdits(index, [])
  })

  it('sums mixed currencies in EUR per row when no account is selected', () => {
    const filter: FilterState = { ...DEFAULT_FILTER, from: '2026-09-01' }
    const expected = reference(filter).filter((entry) => entry.status !== 'declined')
    const inEur = expected.map((entry) => convert(entry.amount, entry.currency, 'EUR'))
    const debits = inEur.filter((value) => value < 0).reduce((sum, value) => sum - value, 0)
    const credits = inEur.filter((value) => value > 0).reduce((sum, value) => sum + value, 0)

    expect(new Set(expected.map((entry) => entry.currency)).size).toBe(3)
    expect(queryLedger(index, filter).totals).toMatchObject({ debits, credits, net: credits - debits, currency: 'EUR' })
  })

  it('sums debits and credits over booked and pending rows in the display currency', () => {
    const filter: FilterState = { ...DEFAULT_FILTER, account: 'acc-ops', from: '2026-01-01' }
    const expected = reference(filter)
    const counted = expected.filter((entry) => entry.status !== 'declined').map((entry) => displayAmount(entry, filter))
    const debits = counted.filter((value) => value < 0).reduce((sum, value) => sum - value, 0)
    const credits = counted.filter((value) => value > 0).reduce((sum, value) => sum + value, 0)

    expect(expected.some((entry) => entry.status === 'declined')).toBe(true)
    expect(queryLedger(index, filter).totals).toEqual({
      count: expected.length,
      debits,
      credits,
      net: credits - debits,
      currency: 'USD',
    })
  })

  it('applies the category edits overlay to filters and restores the seeded category when cleared', () => {
    const target = rows.find((entry) => entry.category === 'software')
    if (target === undefined) {
      throw new Error('No software transaction to edit.')
    }
    const travel: FilterState = { ...DEFAULT_FILTER, cat: ['travel'] }
    const before = queryLedger(index, travel).ids

    applyCategoryEdits(index, [[target.id, 'travel']])
    const edited = queryLedger(index, travel).ids
    expect(edited).toHaveLength(before.length + 1)
    expect([...edited]).toContain(target.id)
    expect([...queryLedger(index, { ...DEFAULT_FILTER, cat: ['software'] }).ids]).not.toContain(target.id)

    applyCategoryEdits(index, [])
    expect([...queryLedger(index, travel).ids]).toEqual([...before])
  })
})

describe('applyFeedSettlements', () => {
  it('settles pending rows for filters and totals and restores the seeded status when cleared', () => {
    const pending = rows.filter((entry) => entry.status === 'pending').slice(0, 2)
    const [first, second] = pending
    if (first === undefined || second === undefined) {
      throw new Error('Expected two pending transactions.')
    }
    const pendingFilter: FilterState = { ...DEFAULT_FILTER, status: ['pending'] }
    const declinedFilter: FilterState = { ...DEFAULT_FILTER, status: ['declined'] }
    const before = queryLedger(index, pendingFilter)
    const all = queryLedger(index, DEFAULT_FILTER).totals

    try {
      applyFeedSettlements(index, [[first.id, 'booked'], [second.id, 'declined']])
      const after = queryLedger(index, pendingFilter)
      expect(after.ids).toHaveLength(before.ids.length - 2)
      expect([...queryLedger(index, declinedFilter).ids]).toContain(second.id)
      const settledTotals = queryLedger(index, DEFAULT_FILTER).totals
      const secondInEur = convert(second.amount, second.currency, 'EUR')
      expect(settledTotals.net).toBe(all.net - secondInEur)
      expect(index.status[first.id]).not.toBe(index.originalStatus[first.id])
    } finally {
      applyFeedSettlements(index, [])
    }
    expect([...queryLedger(index, pendingFilter).ids]).toEqual([...before.ids])
    expect(queryLedger(index, DEFAULT_FILTER).totals).toEqual(all)
  })
})

function spend(entry: Transaction): number {
  return entry.status === 'declined' || entry.amount >= 0 ? 0 : -entry.amount
}

describe('cardSpend', () => {
  it('sums booked and pending card debits of September 2026 in the card account currency', () => {
    const start = monthStart(COMPLETE_MONTHS)
    const expected = CARDS.map((card) => rows
      .filter((entry) => entry.cardId === card.id && entry.bookedAt >= start)
      .reduce((sum, entry) => sum + convert(spend(entry), entry.currency, accountCurrency(card.accountId)), 0))

    const result = cardSpend(index)
    expect(result.map((entry) => entry.cardId)).toEqual(CARDS.map((card) => card.id))
    expect(result.map((entry) => entry.monthToDate)).toEqual(expected)
    expect(result.map((entry) => entry.currency)).toEqual(CARDS.map((card) => accountCurrency(card.accountId)))
    expect(expected.some((total) => total > 0)).toBe(true)
  })

  it('drops a pending card debit once the feed declines it', () => {
    const target = rows.find((entry) => entry.status === 'pending' && entry.cardId !== undefined && entry.bookedAt >= monthStart(COMPLETE_MONTHS))
    if (target?.cardId === undefined) {
      throw new Error('Expected a pending card debit this month.')
    }
    const cardId = target.cardId
    const before = cardSpend(index).find((entry) => entry.cardId === cardId)?.monthToDate ?? 0

    let after = before
    try {
      applyFeedSettlements(index, [[target.id, 'declined']])
      after = cardSpend(index).find((entry) => entry.cardId === cardId)?.monthToDate ?? 0
    } finally {
      applyFeedSettlements(index, [])
    }

    expect(before - after).toBe(-convert(target.amount, target.currency, accountCurrency(target.accountId)))
  })
})

describe('budgetSpend', () => {
  it('returns the month-to-date spend in EUR and the share of the last three complete months per expense category', () => {
    const monthToDateStart = monthStart(COMPLETE_MONTHS)
    const shareStart = monthStart(COMPLETE_MONTHS - 3)
    const expenseIds = CATEGORIES.filter((category) => category.kind === 'expense').map((category) => category.id)
    const inEur = (entry: Transaction): number => convert(spend(entry), entry.currency, 'EUR')
    const recent = expenseIds.map((categoryId) => rows
      .filter((entry) => entry.category === categoryId && entry.bookedAt >= shareStart && entry.bookedAt < monthToDateStart)
      .reduce((sum, entry) => sum + inEur(entry), 0))
    const recentTotal = recent.reduce((sum, value) => sum + value, 0)

    const result = budgetSpend(index)
    expect(result.map((entry) => entry.categoryId)).toEqual(expenseIds)
    expect(result.map((entry) => entry.monthToDate)).toEqual(expenseIds.map((categoryId) => rows
      .filter((entry) => entry.category === categoryId && entry.bookedAt >= monthToDateStart)
      .reduce((sum, entry) => sum + inEur(entry), 0)))
    result.forEach((entry, position) => {
      expect(entry.share).toBeCloseTo((recent[position] ?? 0) / recentTotal, 12)
    })
    expect(result.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1, 12)
  })
})

describe('counterpartyHistory', () => {
  it('returns the latest transactions with a counterparty, excluding one id', () => {
    const latest = sortedIds(rows.filter((entry) => entry.counterpartyId === 'emp-01'), (entry) => entry.bookedAt, 'desc')
    const exclude = latest[1] ?? -1

    expect([...counterpartyHistory(index, 'emp-01', 12, exclude)]).toEqual(latest.filter((id) => id !== exclude).slice(0, 12))
    expect(counterpartyHistory(index, 'emp-01', 0, exclude)).toHaveLength(0)
  })
})

describe('ledgerSeries', () => {
  it('returns one account in its own currency and all accounts summed in EUR', () => {
    const byAccount = monthlySeriesByAccount()
    const all = ledgerSeries(null)

    expect(ledgerSeries('acc-uk')).toEqual({ ...byAccount['acc-uk'], currency: 'GBP' })
    expect(all.currency).toBe('EUR')
    expect(all.income[0]).toBe(
      (byAccount['acc-main'].income[0] ?? 0)
      + convert(byAccount['acc-ops'].income[0] ?? 0, 'USD', 'EUR')
      + convert(byAccount['acc-uk'].income[0] ?? 0, 'GBP', 'EUR'),
    )
  })
})
