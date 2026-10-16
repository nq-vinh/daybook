import { describe, expect, it } from 'vitest'

import { forecast } from './forecast'
import { convert } from './fx'
import {
  accountAmount,
  COMPLETE_MONTHS,
  monthlySeriesByAccount,
  PENDING_WINDOW_MS,
  RECURRING_COUNT,
  type Transaction,
  transaction,
  TRANSACTION_COUNT,
  transactionStatus,
} from './transactions'
import { accountCurrency, type AccountId, ACCOUNTS, CARDS, CATEGORIES, monthIndexOf, TODAY, WINDOW_MONTHS, WINDOW_START } from './world'

function generate(): Transaction[] {
  return Array.from({ length: TRANSACTION_COUNT }, (_, id) => transaction(id))
}

function fingerprint(entries: readonly Transaction[]): string {
  let hash = 0x811c9dc5
  for (const entry of entries) {
    const text = JSON.stringify(entry)
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
    }
  }
  return hash.toString(16).padStart(8, '0')
}

const world = generate()
const organic = world.slice(RECURRING_COUNT)
const kindOf = new Map<string, string>(CATEGORIES.map((category) => [category.id, category.kind]))

function share(entries: readonly Transaction[], predicate: (entry: Transaction) => boolean): number {
  return entries.filter(predicate).length / entries.length
}

describe('transactions', () => {
  it('generates an identical world twice', () => {
    expect(world).toHaveLength(100_000)
    expect(fingerprint(generate())).toBe(fingerprint(world))
    expect(fingerprint(world)).toMatchInlineSnapshot(`"3adee14c"`)
  })

  it('is a pure function of the index regardless of call order', () => {
    expect(transaction(99_999)).toEqual(world[99_999])
    expect(transaction(12_345)).toEqual(transaction(12_345))
    expect([5, 4, 3].map((id) => transaction(id))).toEqual([world[5], world[4], world[3]])
  })

  it('pins a few transactions', () => {
    expect(transaction(0)).toMatchInlineSnapshot(`
      {
        "accountId": "acc-main",
        "amount": -485000,
        "bookedAt": 1696140000000,
        "category": "rent",
        "counterpartyId": "sup-01",
        "currency": "EUR",
        "id": 0,
        "reference": "Rent 2023-10",
        "status": "booked",
        "vatRate": 19,
      }
    `)
    expect(transaction(12_345)).toMatchInlineSnapshot(`
      {
        "accountId": "acc-main",
        "amount": 4079,
        "bookedAt": 1772787864259,
        "category": "interest",
        "counterpartyId": "plt-09",
        "currency": "EUR",
        "id": 12345,
        "reference": "Interest 2026-03",
        "status": "booked",
        "vatRate": 0,
      }
    `)
    expect(transaction(99_999)).toMatchInlineSnapshot(`
      {
        "accountId": "acc-main",
        "amount": -135695,
        "bookedAt": 1745952929618,
        "category": "professional",
        "counterpartyId": "sup-19",
        "currency": "EUR",
        "id": 99999,
        "reference": "Invoice 28464",
        "status": "booked",
        "vatRate": 19,
      }
    `)
  })

  it('reads the status without generating the rest of the transaction', () => {
    expect(world.every((entry) => transactionStatus(entry.id) === entry.status)).toBe(true)
    expect(() => transactionStatus(TRANSACTION_COUNT)).toThrow(RangeError)
  })

  it('rejects indices outside the world', () => {
    for (const id of [-1, 100_000, 1.5, Number.NaN]) {
      expect(() => transaction(id)).toThrow(RangeError)
    }
  })

  it('keeps every transaction well formed and inside the window', () => {
    for (const [index, entry] of world.entries()) {
      expect(entry.id).toBe(index)
      expect(Number.isInteger(entry.amount) && entry.amount !== 0).toBe(true)
      expect(entry.bookedAt).toBeGreaterThanOrEqual(WINDOW_START)
      expect(entry.bookedAt).toBeLessThanOrEqual(TODAY)
      expect(Math.sign(entry.amount)).toBe(kindOf.get(entry.category) === 'income' ? 1 : -1)
    }
  })

  it('sets VAT by category', () => {
    const rates = new Map<string, Set<number>>()
    for (const entry of world) {
      rates.set(entry.category, (rates.get(entry.category) ?? new Set<number>()).add(entry.vatRate))
    }
    expect(Object.fromEntries([...rates].map(([category, set]) => [category, [...set]]))).toEqual({
      revenue: [0], interest: [0], refunds: [19], salaries: [0], tax: [0], rent: [19], software: [19],
      travel: [19], meals: [7], office: [19], marketing: [19], hardware: [19], professional: [19], utilities: [19],
    })
  })

  it('charges cards only on expenses and only on an active card of the same account', () => {
    const cardPayments = world.filter((entry) => entry.cardId !== undefined)
    expect(cardPayments.length).toBeGreaterThan(30_000)
    for (const entry of cardPayments) {
      const card = CARDS.find((candidate) => candidate.id === entry.cardId)
      expect(card?.accountId).toBe(entry.accountId)
      expect(card?.status).toBe('active')
      expect(kindOf.get(entry.category)).toBe('expense')
    }
  })

  it('lays out the recurring schedule', () => {
    const recurring = world.slice(0, RECURRING_COUNT)
    const day = (entry: Transaction) => new Date(entry.bookedAt).getUTCDate()
    expect(RECURRING_COUNT).toBe(766)
    const rent = recurring.filter((entry) => entry.category === 'rent')
    expect(rent).toHaveLength(WINDOW_MONTHS)
    expect(rent.every((entry) => day(entry) === 1)).toBe(true)
    const salaries = recurring.filter((entry) => entry.category === 'salaries')
    expect(salaries).toHaveLength(12 * (WINDOW_MONTHS - 1))
    expect(salaries.every((entry) => day(entry) === 25)).toBe(true)
    const subscriptions = recurring.filter((entry) => entry.category === 'software')
    expect(new Set(subscriptions.map(day))).toEqual(new Set([2, 4, 7, 9, 12, 15, 19, 23]))
    expect(subscriptions).toHaveLength(8 * (WINDOW_MONTHS - 1) + 6)
    const tax = recurring.filter((entry) => entry.category === 'tax')
    expect(tax).toHaveLength(24)
    expect(new Set(tax.map((entry) => new Date(entry.bookedAt).getUTCMonth()))).toEqual(new Set([0, 3, 6, 9]))
    const keys = recurring.map((entry) => `${entry.category}|${entry.counterpartyId}|${String(monthIndexOf(entry.bookedAt))}`)
    expect(new Set(keys).size).toBe(RECURRING_COUNT)
    for (const counterpartyId of ['tax-01', 'tax-02']) {
      const quarters = tax.filter((entry) => entry.counterpartyId === counterpartyId).map((entry) => monthIndexOf(entry.bookedAt))
      expect(quarters).toEqual(Array.from({ length: 12 }, (_, quarter) => quarter * 3))
    }
    expect(recurring.every((entry) => entry.status === 'booked' && entry.currency === accountCurrency(entry.accountId))).toBe(true)
  })

  it('matches the status and currency distributions', () => {
    const pendingShare = share(world, (entry) => entry.status === 'pending')
    expect(pendingShare).toBeGreaterThan(0.01)
    expect(pendingShare).toBeLessThanOrEqual(0.02)
    const recentOrganic = organic.filter((entry) => entry.bookedAt > TODAY - PENDING_WINDOW_MS)
    expect(share(recentOrganic, (entry) => entry.status === 'pending')).toBeCloseTo(0.6, 1)
    expect(share(world, (entry) => entry.status === 'declined')).toBeCloseTo(0.01, 2)
    expect(world.every((entry) => entry.status !== 'pending' || entry.bookedAt > TODAY - PENDING_WINDOW_MS)).toBe(true)
    expect(world.every((entry) => entry.status !== 'declined' || kindOf.get(entry.category) === 'expense')).toBe(true)
    const own = share(organic, (entry) => entry.currency === accountCurrency(entry.accountId))
    expect(own).toBeGreaterThan(0.83)
    expect(own).toBeLessThan(0.87)
  })

  it('weights recent months higher', () => {
    const months = world.map((entry) => monthIndexOf(entry.bookedAt))
    const firstSix = months.filter((month) => month < 6).length
    const lastSix = months.filter((month) => month >= WINDOW_MONTHS - 6).length
    expect(lastSix).toBeGreaterThan(firstSix * 1.8)
  })

  it('never takes an account below zero over the full history', () => {
    const balances = new Map<string, number>(ACCOUNTS.map((account) => [account.id, account.openingBalance]))
    const chronological = world.toSorted((left, right) => left.bookedAt - right.bookedAt || left.id - right.id)
    let lowest = Infinity
    for (const entry of chronological) {
      const balance = (balances.get(entry.accountId) ?? 0) + accountAmount(entry)
      balances.set(entry.accountId, balance)
      lowest = Math.min(lowest, balance)
    }
    expect(lowest).toBeGreaterThanOrEqual(0)
    const closingEur = (accountId: AccountId) => convert(balances.get(accountId) ?? 0, accountCurrency(accountId), 'EUR')
    expect(closingEur('acc-main')).toBeGreaterThan(closingEur('acc-ops'))
    expect(closingEur('acc-main')).toBeGreaterThan(closingEur('acc-uk'))
  })

  it('splits complete months and the month to date into income, expense and net per account', () => {
    const series = monthlySeriesByAccount()
    for (const account of ACCOUNTS) {
      const { income, expense, net, monthToDate } = series[account.id]
      expect([income.length, expense.length, net.length]).toEqual([COMPLETE_MONTHS, COMPLETE_MONTHS, COMPLETE_MONTHS])
      const settled = world.filter((entry) => entry.accountId === account.id && entry.status !== 'declined')
      const totals = (complete: boolean) => {
        const amounts = settled
          .filter((entry) => (monthIndexOf(entry.bookedAt) < COMPLETE_MONTHS) === complete)
          .map((entry) => convert(entry.amount, entry.currency, account.currency))
        const incoming = amounts.filter((amount) => amount > 0).reduce((total, amount) => total + amount, 0)
        const outgoing = -amounts.filter((amount) => amount < 0).reduce((total, amount) => total + amount, 0)
        return { income: incoming, expense: outgoing, net: incoming - outgoing }
      }
      const add = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
      expect({ income: add(income), expense: add(expense), net: add(net) }).toEqual(totals(true))
      expect(monthToDate).toEqual(totals(false))
      expect(net.every((value, index) => value === (income[index] ?? 0) - (expense[index] ?? 0))).toBe(true)
      expect(expense.every((value) => value > 0)).toBe(true)
    }
  })

  it('forecasts every account within a third to three times of each series mean', () => {
    const series = monthlySeriesByAccount()
    for (const account of ACCOUNTS) {
      const history = series[account.id]
      const projected = forecast(history)
      for (const key of ['income', 'expense'] as const) {
        const mean = history[key].reduce((total, value) => total + value, 0) / history[key].length
        for (const month of projected[key]) {
          expect(month).toBeGreaterThanOrEqual(mean / 3)
          expect(month).toBeLessThanOrEqual(mean * 3)
        }
      }
    }
  })
})
