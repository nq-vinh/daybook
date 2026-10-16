// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { mulberry32, type RandomSource } from '../domain/prng'
import { ACCOUNTS, CARDS, CATEGORIES } from '../domain/world'
import {
  DEFAULT_FILTER,
  type FilterState,
  normalizeFilter,
  parseFilter,
  serializeFilter,
  SORT_COLUMNS,
  SORT_DIRECTIONS,
  STATUSES,
} from './url'

function pick<T>(random: RandomSource, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)]
  if (value === undefined) {
    throw new RangeError('Cannot pick from an empty list.')
  }
  return value
}

function sample<T>(random: RandomSource, values: readonly T[]): T[] {
  const count = Math.floor(random() * 4)
  return Array.from({ length: count }, () => pick(random, values))
}

const QUERY_ALPHABET = ['a', 'Z', '7', ' ', '&', '=', '+', ',', '%', '?', '#', ':', 'é', '€', '😀', '\uD800']
const DATES = ['2024-02-29', '2025-02-29', '2026-09-16', '2023-13-01', '2024-1-05', 'yesterday', '2025-04-31']
const AMOUNTS = [0, 1, 4_250, 1_000_000, -5, 2.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]

function randomFilter(random: RandomSource): FilterState {
  const maybe = <T>(value: () => T): T | null => (random() < 0.5 ? null : value())

  return {
    q: random() < 0.3 ? '' : Array.from({ length: 1 + Math.floor(random() * 8) }, () => pick(random, QUERY_ALPHABET)).join(''),
    account: maybe(() => pick(random, ACCOUNTS).id),
    cat: sample(random, CATEGORIES.map((category) => category.id)),
    card: sample(random, CARDS.map((card) => card.id)),
    status: sample(random, STATUSES),
    from: maybe(() => pick(random, DATES)),
    to: maybe(() => pick(random, DATES)),
    min: maybe(() => pick(random, AMOUNTS)),
    max: maybe(() => pick(random, AMOUNTS)),
    sort: { column: pick(random, SORT_COLUMNS), dir: pick(random, SORT_DIRECTIONS) },
  }
}

describe('parseFilter', () => {
  it('returns the defaults for an empty search', () => {
    expect(parseFilter('')).toEqual(DEFAULT_FILTER)
    expect(parseFilter('?')).toEqual(DEFAULT_FILTER)
  })

  it('drops unknown ids, invalid dates, non-integer amounts and unknown sorts', () => {
    const filter = parseFilter(
      '?account=acc-nope&cat=travel,nope,software,travel&card=card-03,card-99&status=pending,lost'
      + '&from=2025-02-30&to=2026-01-31&min=12.5&max=-4&sort=amount:sideways',
    )

    expect(filter).toEqual({
      ...DEFAULT_FILTER,
      cat: ['software', 'travel'],
      card: ['card-03'],
      status: ['pending'],
      to: '2026-01-31',
    })
  })

  it('merges repeated multi-value keys and keeps the first single value', () => {
    const filter = parseFilter('?cat=travel&cat=meals,travel&account=acc-uk&account=acc-main&sort=status:asc')

    expect(filter.cat).toEqual(['meals', 'travel'])
    expect(filter.account).toBe('acc-uk')
    expect(filter.sort).toEqual({ column: 'status', dir: 'asc' })
  })

  it('keeps a reversed date range and a reversed amount range as typed', () => {
    expect(parseFilter('?from=2026-03-31&to=2026-01-01&min=900&max=100')).toMatchObject({
      from: '2026-03-31',
      to: '2026-01-01',
      min: 900,
      max: 100,
    })
  })

  it('decodes the search term and keeps its whitespace', () => {
    expect(parseFilter('?q=Invoice+%2B%20VAT%20').q).toBe('Invoice + VAT ')
  })
})

describe('serializeFilter', () => {
  it('returns an empty string when nothing is set', () => {
    expect(serializeFilter(DEFAULT_FILTER)).toBe('')
  })

  it('emits keys in table order with sorted, comma-joined multi-values', () => {
    const search = serializeFilter({
      q: 'rent q3',
      account: 'acc-main',
      cat: ['travel', 'meals', 'travel'],
      card: ['card-02', 'card-01'],
      status: ['pending', 'booked'],
      from: '2026-01-01',
      to: '2026-03-31',
      min: 100,
      max: 50_000,
      sort: { column: 'amount', dir: 'asc' },
    })

    expect(search).toBe(
      '?q=rent%20q3&account=acc-main&cat=meals,travel&card=card-01,card-02&status=booked,pending'
      + '&from=2026-01-01&to=2026-03-31&min=100&max=50000&sort=amount:asc',
    )
  })

  it('drops a search term that cannot be encoded', () => {
    expect(serializeFilter({ ...DEFAULT_FILTER, q: 'abc\uD800', cat: ['rent'] })).toBe('?cat=rent')
  })

  it('writes reversed ranges unchanged', () => {
    expect(serializeFilter({ ...DEFAULT_FILTER, from: '2026-05-01', to: '2026-02-01', min: 50, max: 10 }))
      .toBe('?from=2026-05-01&to=2026-02-01&min=50&max=10')
  })

  it('omits the default sort', () => {
    expect(serializeFilter({ ...DEFAULT_FILTER, sort: { column: 'bookedAt', dir: 'desc' } })).toBe('')
    expect(serializeFilter({ ...DEFAULT_FILTER, sort: { column: 'bookedAt', dir: 'asc' } })).toBe('?sort=bookedAt:asc')
  })
})

describe('round trip', () => {
  it('holds for 500 seeded random filter states', () => {
    const random = mulberry32(0x5eed)

    for (let run = 0; run < 500; run += 1) {
      const state = randomFilter(random)
      const search = serializeFilter(state)

      expect(parseFilter(search)).toEqual(normalizeFilter(state))
      expect(serializeFilter(parseFilter(search))).toBe(search)
    }
  })
})
