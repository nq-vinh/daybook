import { describe, expect, it } from 'vitest'

import { deriveSeed, hashCombine, mulberry32, WORLD_SEED, worldRandom } from './prng'

function take(random: () => number, count: number): number[] {
  return Array.from({ length: count }, () => random())
}

describe('prng', () => {
  it('uses the world seed from the spec', () => {
    expect(WORLD_SEED).toBe(0xda7b00)
  })

  it('derives unsigned 32-bit seeds deterministically', () => {
    expect(deriveSeed(0)).toBe(deriveSeed(0))
    expect(deriveSeed(1)).not.toBe(deriveSeed(2))
    for (const index of [0, 1, 99_999, 2 ** 31]) {
      const seed = deriveSeed(index)
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(2 ** 32)
    }
  })

  it('combines parts order-sensitively', () => {
    expect(hashCombine(WORLD_SEED, 1, 2)).toBe(hashCombine(WORLD_SEED, 1, 2))
    expect(hashCombine(WORLD_SEED, 1, 2)).not.toBe(hashCombine(WORLD_SEED, 2, 1))
    expect(hashCombine(WORLD_SEED, 1)).not.toBe(hashCombine(WORLD_SEED + 1, 1))
    expect(hashCombine(WORLD_SEED)).toBe(WORLD_SEED)
  })

  it('replays the same stream for the same seed', () => {
    expect(take(mulberry32(42), 5)).toEqual(take(mulberry32(42), 5))
    expect(take(worldRandom(7), 5)).toEqual(take(worldRandom(7), 5))
    expect(take(worldRandom(7), 5)).not.toEqual(take(worldRandom(8), 5))
  })

  it('stays inside [0, 1) with a roughly uniform mean', () => {
    const values = take(worldRandom(1), 20_000)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean).toBeGreaterThan(0.49)
    expect(mean).toBeLessThan(0.51)
  })
})
