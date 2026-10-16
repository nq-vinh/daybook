import { describe, expect, it } from 'vitest'

import { convert, RATES_PER_100_EUR, roundHalfAwayFromZero } from './fx'
import { worldRandom } from './prng'
import { CURRENCIES } from './world'

describe('fx', () => {
  it('pins the fixed rate table relative to EUR', () => {
    expect(RATES_PER_100_EUR).toEqual({ EUR: 100, USD: 108, GBP: 86 })
  })

  it('rounds half away from zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3)
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3)
    expect(roundHalfAwayFromZero(2.4)).toBe(2)
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2)
  })

  it('converts integer minor units through EUR', () => {
    expect(convert(10_000, 'EUR', 'USD')).toBe(10_800)
    expect(convert(10_000, 'EUR', 'GBP')).toBe(8_600)
    expect(convert(10_800, 'USD', 'EUR')).toBe(10_000)
    expect(convert(-10_000, 'GBP', 'USD')).toBe(-12_558)
    expect(convert(1_234, 'GBP', 'GBP')).toBe(1_234)
    expect(Object.is(convert(0, 'EUR', 'USD'), 0)).toBe(true)
    expect(Object.is(convert(-1, 'EUR', 'GBP'), -1)).toBe(true)
  })

  it('rounds exact halves away from zero', () => {
    expect(convert(135, 'USD', 'GBP')).toBe(108)
    expect(convert(-135, 'USD', 'GBP')).toBe(-108)
    expect(convert(50, 'EUR', 'USD')).toBe(54)
    expect(convert(25, 'EUR', 'GBP')).toBe(22)
    expect(convert(-25, 'EUR', 'GBP')).toBe(-22)
  })

  it('rounds non-half results to the nearest minor unit for every pair', () => {
    expect(convert(1_001, 'EUR', 'USD')).toBe(1_081)
    expect(convert(1_001, 'USD', 'EUR')).toBe(927)
    expect(convert(1_001, 'EUR', 'GBP')).toBe(861)
    expect(convert(1_001, 'GBP', 'EUR')).toBe(1_164)
    expect(convert(1_001, 'USD', 'GBP')).toBe(797)
    expect(convert(1_001, 'GBP', 'USD')).toBe(1_257)
  })

  it('keeps the round trip within one minor unit', () => {
    const random = worldRandom(0xf0)
    for (const from of CURRENCIES) {
      for (const to of CURRENCIES) {
        for (let sample = 0; sample < 2_000; sample += 1) {
          const minor = Math.round((random() - 0.5) * 20_000_000)
          const back = convert(convert(minor, from, to), to, from)
          expect(Number.isInteger(back)).toBe(true)
          expect(Math.abs(back - minor)).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
