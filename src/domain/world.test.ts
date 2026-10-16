import { describe, expect, it } from 'vitest'

import {
  ACCOUNTS,
  BUDGETS,
  CARDS,
  CATEGORIES,
  COUNTERPARTIES,
  monthIndexOf,
  monthStart,
  TODAY,
  TODAY_ISO,
  WINDOW_MONTHS,
  WINDOW_START,
} from './world'

describe('world', () => {
  it('pins today and the 36-month window', () => {
    expect(new Date(TODAY).toISOString()).toBe(TODAY_ISO)
    expect(new Date(WINDOW_START).toISOString()).toBe('2023-10-01T00:00:00.000Z')
    expect(WINDOW_MONTHS).toBe(36)
    expect(monthIndexOf(WINDOW_START)).toBe(0)
    expect(monthIndexOf(TODAY)).toBe(WINDOW_MONTHS - 1)
    expect(monthIndexOf(monthStart(13) - 1)).toBe(12)
    expect(new Date(monthStart(WINDOW_MONTHS)).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('has three accounts in three currencies', () => {
    expect(ACCOUNTS.map((account) => [account.id, account.currency])).toEqual([
      ['acc-main', 'EUR'],
      ['acc-ops', 'USD'],
      ['acc-uk', 'GBP'],
    ])
    for (const account of ACCOUNTS) {
      expect(Number.isInteger(account.openingBalance)).toBe(true)
      expect(account.openingBalance).toBeGreaterThan(0)
      expect(account.iban).toMatch(/^[A-Z]{2}\d{2}( [A-Z0-9]{4})+( [A-Z0-9]{1,4})?$/)
    }
  })

  it('has twelve cards held by employees, two frozen, an active card on every account', () => {
    const employees = new Set(COUNTERPARTIES.filter((party) => party.kind === 'employee').map((party) => party.name))
    expect(CARDS).toHaveLength(12)
    expect(new Set(CARDS.map((card) => card.id)).size).toBe(12)
    expect(CARDS.filter((card) => card.status === 'frozen')).toHaveLength(2)
    for (const card of CARDS) {
      expect(employees.has(card.holder)).toBe(true)
      expect(card.last4).toMatch(/^\d{4}$/)
      expect(ACCOUNTS.some((account) => account.id === card.accountId)).toBe(true)
    }
    for (const account of ACCOUNTS) {
      expect(CARDS.some((card) => card.accountId === account.id && card.status === 'active')).toBe(true)
    }
  })

  it('has about sixty uniquely named counterparties across all five kinds', () => {
    expect(COUNTERPARTIES.length).toBeGreaterThanOrEqual(55)
    expect(COUNTERPARTIES.length).toBeLessThanOrEqual(65)
    expect(new Set(COUNTERPARTIES.map((party) => party.id)).size).toBe(COUNTERPARTIES.length)
    expect(new Set(COUNTERPARTIES.map((party) => party.name)).size).toBe(COUNTERPARTIES.length)
    expect(new Set(COUNTERPARTIES.map((party) => party.kind))).toEqual(
      new Set(['supplier', 'customer', 'employee', 'tax', 'platform']),
    )
  })

  it('has fourteen categories and one budget per expense category', () => {
    expect(CATEGORIES).toHaveLength(14)
    expect(new Set(CATEGORIES.map((category) => category.id)).size).toBe(14)
    const expenses = CATEGORIES.filter((category) => category.kind === 'expense').map((category) => category.id)
    expect(BUDGETS.map((budget) => budget.categoryId)).toEqual(expenses)
    for (const budget of BUDGETS) {
      expect(Number.isInteger(budget.monthlyAmount)).toBe(true)
      expect(budget.monthlyAmount).toBeGreaterThan(0)
    }
  })
})
