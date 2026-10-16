import { defaultLocale } from '../../domain/format'
import { type AccountId, ACCOUNTS, type CardId, CARDS, CATEGORIES, WINDOW_START, TODAY } from '../../domain/world'
import { getLocation, navigate } from '../../router/history'
import { DEFAULT_FILTER, type FilterState, parseFilter, serializeFilter } from '../../state/url'

export const LEDGER_PATH = '/transactions'

export const SELECTION_LIMIT = 1_000

export const CATEGORY_GROUPS = [
  { label: 'Income', categories: CATEGORIES.filter((category) => category.kind === 'income') },
  { label: 'Expense', categories: CATEGORIES.filter((category) => category.kind === 'expense') },
] as const

export function formatCount(value: number): string {
  return new Intl.NumberFormat(defaultLocale()).format(value)
}

export const FIRST_DAY = isoDay(WINDOW_START)

export const LAST_DAY = isoDay(TODAY)

function isoDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10)
}

export function isAccountId(value: string): value is AccountId {
  return ACCOUNTS.some((account) => account.id === value)
}

export function cardsForAccount(account: AccountId | null): typeof CARDS[number][] {
  return CARDS.filter((card) => account === null || card.accountId === account)
}

export function writeFilter(
  update: (current: FilterState) => FilterState,
  { replace = false }: { readonly replace?: boolean } = {},
): void {
  const { pathname, search } = getLocation()
  navigate(`${pathname}${serializeFilter(update(parseFilter(search)))}`, { replace })
}

export function writeSearch(q: string): void {
  if (window.location.pathname !== LEDGER_PATH) {
    return
  }
  const wasEmpty = parseFilter(getLocation().search).q.trim() === ''
  writeFilter((current) => ({ ...current, q }), { replace: wasEmpty === (q.trim() === '') })
}

export function withAccount(filter: FilterState, account: AccountId | null): FilterState {
  const kept = new Set<CardId>(cardsForAccount(account).map((card) => card.id))
  return { ...filter, account, card: filter.card.filter((card) => kept.has(card)) }
}

export function writeAccount(account: AccountId | null): void {
  const { pathname, search } = getLocation()

  if (pathname === LEDGER_PATH) {
    writeFilter((current) => withAccount(current, account))
    return
  }

  const params = new URLSearchParams(search)
  if (account === null) {
    params.delete('account')
  } else {
    params.set('account', account)
  }
  const query = params.toString()
  navigate(`${pathname}${query === '' ? '' : `?${query}`}`)
}

export function toggled<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value]
}

export function activeFilterCount(filter: FilterState): number {
  return filter.cat.length
    + filter.card.length
    + filter.status.length
    + (filter.from !== null || filter.to !== null ? 1 : 0)
    + (filter.min !== null ? 1 : 0)
    + (filter.max !== null ? 1 : 0)
}

export function clearedFilter(filter: FilterState): FilterState {
  return { ...DEFAULT_FILTER, q: filter.q, account: filter.account, sort: filter.sort }
}

export function hasNarrowingFilters(filter: FilterState): boolean {
  return filter.q !== '' || activeFilterCount(filter) > 0
}
