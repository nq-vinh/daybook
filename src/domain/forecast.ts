import { roundHalfAwayFromZero } from './fx'

const SEASON_MIN = 0.5
const SEASON_MAX = 1.5
const BASE_MONTHS = 3

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

export function seasonalFactor(monthlyNet: readonly number[], monthOffset: number): number {
  const overall = mean(monthlyNet)
  const sameMonth = mean(monthlyNet.filter((_, index) => index < monthOffset && (monthOffset - index) % 12 === 0))
  if (overall <= 0 || sameMonth <= 0) {
    return 1
  }
  return Math.min(SEASON_MAX, Math.max(SEASON_MIN, sameMonth / overall))
}

export interface ForecastInput {
  income: readonly number[]
  expense: readonly number[]
}

export interface Forecast {
  income: number[]
  expense: number[]
  net: number[]
}

function forecastSeries(series: readonly number[], months: number): number[] {
  const base = mean(series.slice(-BASE_MONTHS))
  return Array.from({ length: months }, (_, ahead) =>
    roundHalfAwayFromZero(base * seasonalFactor(series, series.length + ahead)))
}

export function forecast(series: ForecastInput, months = 3): Forecast {
  const income = forecastSeries(series.income, months)
  const expense = forecastSeries(series.expense, months)
  return { income, expense, net: income.map((value, index) => value - (expense[index] ?? 0)) }
}
