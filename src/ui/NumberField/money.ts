export type NonNegativeMinorUnits = number

export const MAX_MINOR_UNITS = 1e15

export interface MoneyFormat {
  readonly fractionDigits: number
  readonly decimal: string
  readonly group: string | undefined
  readonly currencyAffixes: readonly string[]
  readonly display: Intl.NumberFormat
  readonly editable: Intl.NumberFormat
  readonly grouping: Intl.NumberFormat
  readonly example: string
}

export type MoneyParseResult =
  | { readonly ok: true; readonly value: NonNegativeMinorUnits | null }
  | { readonly ok: false; readonly reason: 'format' | 'too-large' }

const DIGITS = /^\d*$/
const BIDI_MARKS = /[\u200e\u200f\u061c]/gu
const APOSTROPHES = new Set(["'", '’'])

export function moneyFormat(locale: string, currency: string): MoneyFormat {
  const display = new Intl.NumberFormat(locale, { style: 'currency', currency, numberingSystem: 'latn' })
  const fractionDigits = display.resolvedOptions().maximumFractionDigits ?? 2
  const parts = new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).formatToParts(1234567.8)
  const symbol = display.formatToParts(1).find((part) => part.type === 'currency')?.value

  return {
    fractionDigits,
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value,
    currencyAffixes: symbol === undefined || symbol === currency ? [currency] : [symbol, currency],
    display,
    editable: new Intl.NumberFormat(locale, {
      numberingSystem: 'latn',
      useGrouping: false,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
    grouping: new Intl.NumberFormat(locale, { numberingSystem: 'latn', useGrouping: 'always', maximumFractionDigits: 0 }),
    example: display.format(1234.56),
  }
}

function normalise(text: string, format: MoneyFormat): string {
  let result = text.replace(BIDI_MARKS, '').trim()

  for (const affix of format.currencyAffixes) {
    if (result.startsWith(affix)) {
      result = result.slice(affix.length).trim()
    }

    if (result.endsWith(affix)) {
      result = result.slice(0, -affix.length).trim()
    }
  }

  const { group } = format

  if (group !== undefined && /\s/u.test(group)) {
    result = result.replace(/\s/gu, group)
  } else if (group !== undefined && APOSTROPHES.has(group)) {
    result = result.replace(/['’]/gu, group)
  }

  return result
}

export function parseMoney(text: string, format: MoneyFormat): MoneyParseResult {
  const normalised = normalise(text, format)

  if (normalised === '') {
    return { ok: true, value: null }
  }

  const [whole = '', fraction, ...rest] = normalised.split(format.decimal)
  const digits = format.group === undefined ? whole : whole.replaceAll(format.group, '')
  const fractionValid = fraction === undefined
    || (format.fractionDigits > 0 && DIGITS.test(fraction) && fraction.length <= format.fractionDigits)
  const groupingValid = digits === whole || (digits !== '' && DIGITS.test(digits) && format.grouping.format(BigInt(digits)) === whole)

  if (rest.length > 0 || !fractionValid || !DIGITS.test(digits) || !groupingValid || digits + (fraction ?? '') === '') {
    return { ok: false, reason: 'format' }
  }

  const value = Number(digits === '' ? '0' : digits) * 10 ** format.fractionDigits
    + Number((fraction ?? '').padEnd(format.fractionDigits, '0') || '0')

  return value > MAX_MINOR_UNITS ? { ok: false, reason: 'too-large' } : { ok: true, value }
}

export function formatMoneyDisplay(minor: NonNegativeMinorUnits, format: MoneyFormat): string {
  return format.display.format(minor / 10 ** format.fractionDigits)
}

export function formatMoneyEditable(minor: NonNegativeMinorUnits, format: MoneyFormat): string {
  return format.editable.format(minor / 10 ** format.fractionDigits)
}
