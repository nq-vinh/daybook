import { describe, expect, it } from 'vitest'

import { forecast, seasonalFactor } from './forecast'

const flat = (value: number, length = 35) => Array.from({ length }, () => value)

describe('forecast', () => {
  it('forecasts flat series flat', () => {
    expect(forecast({ income: flat(5_000), expense: flat(3_000) })).toEqual({
      income: [5_000, 5_000, 5_000],
      expense: [3_000, 3_000, 3_000],
      net: [2_000, 2_000, 2_000],
    })
  })

  it('uses the mean of the last three months as the base and returns integer minor units', () => {
    const result = forecast({ income: [0, 0, 0, 100, 200, 300], expense: [1, 2, 2] }, 2)
    expect(result).toEqual({ income: [200, 200], expense: [2, 2], net: [198, 198] })
  })

  it('lifts December income when prior Decembers spiked', () => {
    const januaryFirst = Array.from({ length: 35 }, (_, index) => (index % 12 === 11 ? 3_000 : 1_000))
    const { income, expense, net } = forecast({ income: januaryFirst, expense: flat(800) }, 2)
    expect(income[0]).toBe(1_500)
    expect(income[1]).toBeLessThan(1_000)
    expect(expense).toEqual([800, 800])
    expect(net).toEqual([700, (income[1] ?? 0) - 800])
  })

  it('follows a known seasonal expense', () => {
    const januaryFirst = Array.from({ length: 35 }, (_, index) => (index % 12 === 0 ? 1_150 : 1_000))
    const { expense } = forecast({ income: flat(2_000), expense: januaryFirst }, 5)
    const overall = januaryFirst.reduce((total, value) => total + value, 0) / januaryFirst.length
    expect(expense).toEqual([1_000, 1_000, 1_000, 1_000, 1_000].map((value, ahead) =>
      Math.round(ahead === 1 ? (value * 1_150) / overall : (value * 1_000) / overall)))
    expect(expense[1]).toBeGreaterThan(expense[0] ?? Infinity)
  })

  it('clamps the seasonal factor and falls back to 1 without positive means', () => {
    const spiky = [10_000, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    expect(seasonalFactor(spiky, 12)).toBe(1.5)
    expect(seasonalFactor(spiky, 13)).toBe(0.5)
    expect(seasonalFactor([1, 2, 3], 3)).toBe(1)
    expect(seasonalFactor([0, 0, 0], 12)).toBe(1)
    expect(seasonalFactor([-5, 10, 10], 12)).toBe(1)
    expect(seasonalFactor([10, -50, -50], 12)).toBe(1)
    expect(forecast({ income: [], expense: [] }, 2)).toEqual({ income: [0, 0], expense: [0, 0], net: [0, 0] })
  })
})
