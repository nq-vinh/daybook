import type { Currency } from './world'

export const RATES_PER_100_EUR = {
  EUR: 100,
  USD: 108,
  GBP: 86,
} as const satisfies Record<Currency, number>

export function roundHalfAwayFromZero(value: number): number {
  const rounded = Math.round(Math.abs(value))
  return value < 0 && rounded !== 0 ? -rounded : rounded
}

export function convert(minor: number, from: Currency, to: Currency): number {
  if (from === to) {
    return minor
  }
  return roundHalfAwayFromZero((minor * RATES_PER_100_EUR[to]) / RATES_PER_100_EUR[from])
}
