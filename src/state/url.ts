import type { TransactionStatus } from '../domain/transactions'
import { type AccountId, ACCOUNTS, type CardId, CARDS, CATEGORIES, type CategoryId, DAY_MS } from '../domain/world'

export const STATUSES = ['booked', 'pending', 'declined'] as const satisfies readonly TransactionStatus[]

export type Status = (typeof STATUSES)[number]

export const SORT_COLUMNS = ['bookedAt', 'amount', 'counterparty', 'category', 'status'] as const

export type SortColumn = (typeof SORT_COLUMNS)[number]

export const SORT_DIRECTIONS = ['asc', 'desc'] as const

export type SortDirection = (typeof SORT_DIRECTIONS)[number]

export interface FilterSort {
  readonly column: SortColumn
  readonly dir: SortDirection
}

export interface FilterState {
  readonly q: string
  readonly account: AccountId | null
  readonly cat: readonly CategoryId[]
  readonly card: readonly CardId[]
  readonly status: readonly Status[]
  readonly from: string | null
  readonly to: string | null
  readonly min: number | null
  readonly max: number | null
  readonly sort: FilterSort
}

export const DEFAULT_SORT: FilterSort = Object.freeze({ column: 'bookedAt', dir: 'desc' })

export const DEFAULT_FILTER: FilterState = Object.freeze({
  q: '',
  account: null,
  cat: Object.freeze([]),
  card: Object.freeze([]),
  status: Object.freeze([]),
  from: null,
  to: null,
  min: null,
  max: null,
  sort: DEFAULT_SORT,
})

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const NON_NEGATIVE_INTEGER = /^\d+$/

function isOneOf<T extends string>(candidates: readonly T[], value: string): value is T {
  return candidates.some((candidate) => candidate === value)
}

const ACCOUNT_IDS: readonly AccountId[] = ACCOUNTS.map((account) => account.id)
const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((category) => category.id)
const CARD_IDS: readonly CardId[] = CARDS.map((card) => card.id)

function compareCodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  return left > right ? 1 : 0
}

function canonicalList<T extends string>(candidates: readonly T[], values: readonly string[]): readonly T[] {
  const kept = new Set(values.filter((value): value is T => isOneOf(candidates, value)))
  return Object.freeze([...kept].sort(compareCodeUnits))
}

export function isoDayStart(value: string): number {
  return ISO_DATE.test(value) ? Date.parse(`${value}T00:00:00.000Z`) : Number.NaN
}

export function isoDayEnd(value: string): number {
  return isoDayStart(value) + DAY_MS
}

function canonicalDate(value: string | null): string | null {
  if (value === null) {
    return null
  }
  const start = isoDayStart(value)
  return Number.isFinite(start) && new Date(start).toISOString().slice(0, 10) === value ? value : null
}

function canonicalAmount(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function canonicalSort(sort: FilterSort): FilterSort {
  if (sort.column === DEFAULT_SORT.column && sort.dir === DEFAULT_SORT.dir) {
    return DEFAULT_SORT
  }
  return isOneOf(SORT_COLUMNS, sort.column) && isOneOf(SORT_DIRECTIONS, sort.dir)
    ? Object.freeze({ column: sort.column, dir: sort.dir })
    : DEFAULT_SORT
}

function canonicalQuery(value: string): string {
  try {
    encodeURIComponent(value)
    return value
  } catch {
    return ''
  }
}

export function normalizeFilter(filter: FilterState): FilterState {
  return Object.freeze({
    q: canonicalQuery(filter.q),
    account: filter.account !== null && isOneOf(ACCOUNT_IDS, filter.account) ? filter.account : null,
    cat: canonicalList(CATEGORY_IDS, filter.cat),
    card: canonicalList(CARD_IDS, filter.card),
    status: canonicalList(STATUSES, filter.status),
    from: canonicalDate(filter.from),
    to: canonicalDate(filter.to),
    min: canonicalAmount(filter.min),
    max: canonicalAmount(filter.max),
    sort: canonicalSort(filter.sort),
  })
}

function readList(params: URLSearchParams, key: string): string[] {
  return params.getAll(key).flatMap((value) => value.split(','))
}

function readAmount(params: URLSearchParams, key: string): number | null {
  const value = params.get(key)
  return value !== null && NON_NEGATIVE_INTEGER.test(value) ? Number(value) : null
}

function readSort(params: URLSearchParams): FilterSort {
  const [column = '', dir = '', ...rest] = (params.get('sort') ?? '').split(':')

  if (rest.length > 0 || !isOneOf(SORT_COLUMNS, column) || !isOneOf(SORT_DIRECTIONS, dir)) {
    return DEFAULT_SORT
  }

  return { column, dir }
}

export function parseFilter(search: string): FilterState {
  const params = new URLSearchParams(search)
  const account = params.get('account')

  return normalizeFilter({
    q: params.get('q') ?? '',
    account: account !== null && isOneOf(ACCOUNT_IDS, account) ? account : null,
    cat: canonicalList(CATEGORY_IDS, readList(params, 'cat')),
    card: canonicalList(CARD_IDS, readList(params, 'card')),
    status: canonicalList(STATUSES, readList(params, 'status')),
    from: params.get('from'),
    to: params.get('to'),
    min: readAmount(params, 'min'),
    max: readAmount(params, 'max'),
    sort: readSort(params),
  })
}

function encodeList(values: readonly string[]): string {
  return values.map(encodeURIComponent).join(',')
}

export function serializeFilter(filter: FilterState): string {
  const canonical = normalizeFilter(filter)
  const pairs: string[] = []

  if (canonical.q !== '') {
    pairs.push(`q=${encodeURIComponent(canonical.q)}`)
  }
  if (canonical.account !== null) {
    pairs.push(`account=${encodeURIComponent(canonical.account)}`)
  }
  if (canonical.cat.length > 0) {
    pairs.push(`cat=${encodeList(canonical.cat)}`)
  }
  if (canonical.card.length > 0) {
    pairs.push(`card=${encodeList(canonical.card)}`)
  }
  if (canonical.status.length > 0) {
    pairs.push(`status=${encodeList(canonical.status)}`)
  }
  if (canonical.from !== null) {
    pairs.push(`from=${canonical.from}`)
  }
  if (canonical.to !== null) {
    pairs.push(`to=${canonical.to}`)
  }
  if (canonical.min !== null) {
    pairs.push(`min=${String(canonical.min)}`)
  }
  if (canonical.max !== null) {
    pairs.push(`max=${String(canonical.max)}`)
  }
  if (canonical.sort !== DEFAULT_SORT) {
    pairs.push(`sort=${canonical.sort.column}:${canonical.sort.dir}`)
  }

  return pairs.length === 0 ? '' : `?${pairs.join('&')}`
}
