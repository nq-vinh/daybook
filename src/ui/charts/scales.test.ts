import { describe, expect, it } from 'vitest'

import { bandScale, linearScale, niceTicks } from './scales'

describe('scales', () => {
  it('maps a domain onto a range, inverted for screen y', () => {
    const y = linearScale([0, 100], [200, 0])

    expect(y(0)).toBe(200)
    expect(y(50)).toBe(100)
    expect(y(100)).toBe(0)
    expect(linearScale([5, 5], [0, 10])(5)).toBe(5)
  })

  it('picks four to five nice ticks that enclose the data', () => {
    for (const [min, max] of [[0, 3_310_000], [-1_150_000, 3_310_000], [-640_000, 0], [12, 97], [0, 1]] as const) {
      const { ticks, min: niceMin, max: niceMax, step } = niceTicks(min, max, 5)

      expect(ticks.length, `${String(min)}..${String(max)}`).toBeGreaterThanOrEqual(4)
      expect(ticks.length, `${String(min)}..${String(max)}`).toBeLessThanOrEqual(5)
      expect(niceMin).toBeLessThanOrEqual(min)
      expect(niceMax).toBeGreaterThanOrEqual(max)
      expect(ticks).toContain(0 >= niceMin && 0 <= niceMax ? 0 : niceMin)
      expect(String(step / 10 ** Math.floor(Math.log10(step)))).toMatch(/^(1|2|2\.5|5)$/)
    }
  })

  it('returns round bounds for a typical cash-flow range', () => {
    expect(niceTicks(-1_150_000, 3_310_000)).toEqual({ min: -2_000_000, max: 4_000_000, step: 2_000_000, ticks: [-2_000_000, 0, 2_000_000, 4_000_000] })
    expect(niceTicks(0, 0).ticks).toEqual([-1, -0.5, 0, 0.5, 1])
  })

  it('positions bands as the step minus a surface gap', () => {
    const wide = bandScale(4, [0, 400], 2)

    expect(wide.step).toBe(100)
    expect(wide.bandwidth).toBe(98)
    expect(wide.start(1)).toBe(101)
    expect(wide.center(1)).toBe(150)
    expect(wide.start(2) - (wide.start(1) + wide.bandwidth)).toBe(2)

    const narrow = bandScale(16, [0, 160], 2)

    expect(narrow.bandwidth).toBe(8)
    expect(narrow.start(0)).toBe(1)
    expect(narrow.index(15.9)).toBe(1)
    expect(narrow.index(159.9)).toBe(15)
    expect(narrow.index(-1)).toBeNull()
    expect(narrow.index(160)).toBeNull()
  })
})
