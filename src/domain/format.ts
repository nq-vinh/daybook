import { DAY_MS, TODAY, type Currency } from './world'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

const RELATIVE_UNITS = [
  { unit: 'second', ms: 1_000 },
  { unit: 'minute', ms: MINUTE_MS },
  { unit: 'hour', ms: HOUR_MS },
  { unit: 'day', ms: DAY_MS },
  { unit: 'week', ms: 7 * DAY_MS },
  { unit: 'month', ms: 30 * DAY_MS },
  { unit: 'year', ms: 360 * DAY_MS },
] as const satisfies readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[]

export function defaultLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language !== '' ? navigator.language : 'en-GB'
}

export function formatMoney(minor: number, currency: Currency, locale = defaultLocale()): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100)
}

export function formatDate(
  epochMs: number,
  locale = defaultLocale(),
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(epochMs)
}

export function formatRelative(bookedAt: number, now = TODAY, locale = defaultLocale()): string {
  const elapsed = bookedAt - now
  const magnitude = Math.abs(elapsed)
  let chosen: (typeof RELATIVE_UNITS)[number] = RELATIVE_UNITS[0]
  for (const candidate of RELATIVE_UNITS) {
    if (Math.round(magnitude / chosen.ms) * chosen.ms < candidate.ms) {
      break
    }
    chosen = candidate
  }
  const value = Math.round(magnitude / chosen.ms)
  const signed = elapsed < 0 && value !== 0 ? -value : value
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(signed, chosen.unit)
}

export function formatPercent(ratio: number, locale = defaultLocale(), maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits }).format(ratio)
}
