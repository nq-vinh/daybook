export const WORLD_SEED = 0xda7b00

export type RandomSource = () => number

export function deriveSeed(index: number, worldSeed = WORLD_SEED): number {
  let value = (worldSeed ^ index) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return (value ^ (value >>> 15)) >>> 0
}

export function hashCombine(seed: number, ...parts: readonly number[]): number {
  let value = seed >>> 0
  for (const part of parts) {
    value = deriveSeed(part, Math.imul(value, 0x9e3779b9) >>> 0)
  }
  return value
}

export function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

export function worldRandom(...parts: readonly number[]): RandomSource {
  return mulberry32(hashCombine(WORLD_SEED, ...parts))
}
