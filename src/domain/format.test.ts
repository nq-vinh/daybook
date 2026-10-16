import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultLocale, formatDate, formatMoney, formatPercent, formatRelative } from './format'
import { DAY_MS, TODAY } from './world'

const NBSP = ' '

describe('format', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('formats integer minor units as money', () => {
    expect(formatMoney(123_456, 'EUR', 'en-GB')).toBe('€1,234.56')
    expect(formatMoney(0, 'EUR', 'en-GB')).toBe('€0.00')
    expect(formatMoney(0, 'EUR', 'de-DE')).toBe(`0,00${NBSP}€`)
    expect(formatMoney(-500, 'GBP', 'en-GB')).toBe('-£5.00')
    expect(formatMoney(123_456, 'EUR', 'de-DE')).toBe(`1.234,56${NBSP}€`)
    expect(formatMoney(-123_456, 'USD', 'de-DE')).toBe(`-1.234,56${NBSP}$`)
  })

  it('formats dates in UTC so every visitor sees the same day', () => {
    const lateEvening = Date.UTC(2026, 8, 15, 23, 30)
    expect(formatDate(lateEvening, 'en-GB')).toBe('15 Sept 2026')
    expect(formatDate(lateEvening, 'de-DE')).toBe('15.09.2026')
    expect(formatDate(lateEvening, 'en-GB', { year: 'numeric', month: 'long' })).toBe('September 2026')
  })

  it('formats relative time against the fixed today by default', () => {
    expect(formatRelative(TODAY, undefined, 'en-GB')).toBe('now')
    expect(formatRelative(TODAY - DAY_MS, undefined, 'en-GB')).toBe('yesterday')
    expect(formatRelative(TODAY - 3 * DAY_MS, TODAY, 'en-GB')).toBe('3 days ago')
    expect(formatRelative(TODAY - 2 * 3_600_000, TODAY, 'en-GB')).toBe('2 hours ago')
    expect(formatRelative(TODAY - 14 * DAY_MS, TODAY, 'en-GB')).toBe('2 weeks ago')
    expect(formatRelative(TODAY - 90 * DAY_MS, TODAY, 'en-GB')).toBe('3 months ago')
    expect(formatRelative(TODAY - 800 * DAY_MS, TODAY, 'en-GB')).toBe('2 years ago')
    expect(formatRelative(TODAY - 344 * DAY_MS, TODAY, 'en-GB')).toBe('11 months ago')
    expect(formatRelative(TODAY - 345 * DAY_MS, TODAY, 'en-GB')).toBe('last year')
    expect(formatRelative(TODAY - 364 * DAY_MS, TODAY, 'en-GB')).toBe('last year')
    expect(formatRelative(TODAY + 364 * DAY_MS, TODAY, 'en-GB')).toBe('next year')
    expect(formatRelative(TODAY - 6.6 * DAY_MS, TODAY, 'en-GB')).toBe('last week')
    expect(formatRelative(TODAY - 45 * DAY_MS, TODAY, 'en-GB')).toBe('2 months ago')
    expect(formatRelative(TODAY + 45 * DAY_MS, TODAY, 'en-GB')).toBe('in 2 months')
    expect(formatRelative(TODAY - 59_600, TODAY, 'en-GB')).toBe('1 minute ago')
    expect(formatRelative(TODAY - DAY_MS, TODAY, 'de-DE')).toBe('gestern')
    expect(formatRelative(TODAY - 3 * DAY_MS, TODAY, 'de-DE')).toBe('vor 3 Tagen')
  })

  it('formats ratios as percentages', () => {
    expect(formatPercent(0.1234, 'en-GB')).toBe('12.3%')
    expect(formatPercent(0.1234, 'de-DE')).toBe(`12,3${NBSP}%`)
    expect(formatPercent(0.5, 'en-GB', 0)).toBe('50%')
  })

  it('defaults the locale to the browser language, else en-GB', () => {
    vi.stubGlobal('navigator', { language: 'de-DE' })
    expect(defaultLocale()).toBe('de-DE')
    expect(formatPercent(0.25)).toBe(`25${NBSP}%`)
    vi.stubGlobal('navigator', undefined)
    expect(defaultLocale()).toBe('en-GB')
    expect(formatPercent(0.25)).toBe('25%')
  })
})
