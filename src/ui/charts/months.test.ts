import { describe, expect, it } from 'vitest'

import { axisLabel, cashFlowSummary, chartMonths, type MonthTotalsAt, monthReadout } from './months'

const months: MonthTotalsAt[] = [
  ...Array.from({ length: 12 }, (_, offset): MonthTotalsAt => ({
    start: Date.UTC(2025, 8 + offset, 1),
    income: 500_000,
    expense: 400_000 - offset * 10_000,
    net: 100_000 + offset * 10_000,
    kind: 'complete',
  })),
  { start: Date.UTC(2026, 8, 1), income: 200_000, expense: 150_000, net: 50_000, kind: 'current' },
  { start: Date.UTC(2026, 9, 1), income: 500_000, expense: 520_000, net: -20_000, kind: 'forecast' },
  { start: Date.UTC(2026, 10, 1), income: 500_000, expense: 450_000, net: 50_000, kind: 'forecast' },
  { start: Date.UTC(2026, 11, 1), income: 500_000, expense: 400_000, net: 100_000, kind: 'forecast' },
]

describe('chart months', () => {
  const labelled = chartMonths(months, 'en-GB')

  it('labels months with the long month and year', () => {
    expect(labelled[0]?.label).toBe('September 2025')
    expect(labelled[15]?.label).toBe('December 2026')
  })

  it('summarises the last 12 months and the forecast in one sentence', () => {
    expect(cashFlowSummary(labelled, 'EUR', 'en-GB')).toBe(
      'Net cash flow over the last 12 months: from +€1,000.00 in September 2025 to +€2,100.00 in August 2026; '
      + 'forecast -€200.00 to +€1,000.00 for the next 3 months.',
    )
    expect(cashFlowSummary(labelled.slice(0, 12), 'EUR', 'en-GB')).toBe(
      'Net cash flow over the last 12 months: from +€1,000.00 in September 2025 to +€2,100.00 in August 2026.',
    )
  })

  it('reads out a month with its net, income, expense and kind', () => {
    const [first] = labelled
    const forecast = labelled[13]
    if (first === undefined || forecast === undefined) {
      throw new RangeError('Missing month')
    }

    expect(monthReadout(first, 'EUR', 'en-GB')).toBe('September 2025: net +€1,000.00, income €5,000.00, expense €4,000.00')
    expect(monthReadout(forecast, 'EUR', 'en-GB')).toBe('October 2026: net -€200.00, income €5,000.00, expense €5,200.00, forecast')
  })

  it('uses the short month on the axis, the year on the first month and January, and "To date" on the current month', () => {
    expect(labelled[0] === undefined ? null : axisLabel(labelled[0], 'en-GB', true)).toEqual(['Sept', '2025'])
    expect(labelled[1] === undefined ? null : axisLabel(labelled[1], 'en-GB')).toEqual(['Oct', null])
    expect(labelled[4] === undefined ? null : axisLabel(labelled[4], 'en-GB')).toEqual(['Jan', '2026'])
    expect(labelled[12] === undefined ? null : axisLabel(labelled[12], 'en-GB')).toEqual(['Sept', 'To date'])
  })
})
