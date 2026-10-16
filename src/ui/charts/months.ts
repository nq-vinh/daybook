import { formatDate, formatMoney, formatSignedMoney } from '../../domain/format'
import type { Currency } from '../../domain/world'

export type CashFlowMonthKind = 'complete' | 'current' | 'forecast'

export interface CashFlowMonth {
  readonly start: number
  readonly label: string
  readonly income: number
  readonly expense: number
  readonly net: number
  readonly kind: CashFlowMonthKind
}

export interface MonthTotalsAt {
  readonly start: number
  readonly income: number
  readonly expense: number
  readonly net: number
  readonly kind: CashFlowMonthKind
}

export function chartMonths(months: readonly MonthTotalsAt[], locale: string): CashFlowMonth[] {
  return months.map((month) => ({ ...month, label: formatDate(month.start, locale, { month: 'long', year: 'numeric' }) }))
}

export function axisLabel(month: CashFlowMonth, locale: string, first = false): readonly [string, string | null] {
  const short = formatDate(month.start, locale, { month: 'short' })
  if (month.kind === 'current') {
    return [short, 'To date']
  }
  return [short, first || new Date(month.start).getUTCMonth() === 0 ? formatDate(month.start, locale, { year: 'numeric' }) : null]
}

export interface SummaryPart {
  readonly text: string
  readonly money: boolean
}

export function cashFlowSummaryParts(months: readonly CashFlowMonth[], currency: Currency, locale: string): readonly SummaryPart[] {
  const complete = months.filter((month) => month.kind === 'complete')
  const projected = months.filter((month) => month.kind === 'forecast')
  const text = (value: string): SummaryPart => ({ text: value, money: false })
  const money = (value: number): SummaryPart => ({ text: formatSignedMoney(value, currency, locale), money: true })
  const first = complete[0]
  const last = complete.at(-1)

  if (first === undefined || last === undefined) {
    return [text('Net cash flow: no complete months yet.')]
  }

  const history = [
    text(`Net cash flow over the last ${String(complete.length)} months: from `),
    money(first.net),
    text(` in ${first.label} to `),
    money(last.net),
    text(` in ${last.label}`),
  ]
  const nextFirst = projected[0]
  const nextLast = projected.at(-1)

  if (nextFirst === undefined || nextLast === undefined) {
    return [...history, text('.')]
  }

  return [
    ...history,
    text('; forecast '),
    money(nextFirst.net),
    text(' to '),
    money(nextLast.net),
    text(` for the next ${String(projected.length)} months.`),
  ]
}

export function cashFlowSummary(months: readonly CashFlowMonth[], currency: Currency, locale: string): string {
  return cashFlowSummaryParts(months, currency, locale).map((part) => part.text).join('')
}

export function monthReadout(month: CashFlowMonth, currency: Currency, locale: string): string {
  const money = (value: number): string => formatMoney(value, currency, locale)
  const suffix = month.kind === 'forecast' ? ', forecast' : month.kind === 'current' ? ', to date' : ''
  return `${month.label}: net ${formatSignedMoney(month.net, currency, locale)}, income ${money(month.income)}, expense ${money(month.expense)}${suffix}`
}
