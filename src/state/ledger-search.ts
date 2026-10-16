import { parseFilter, serializeFilter } from './url'

export const LEDGER_SEARCH_KEY = 'daybook:ledger-search'

export function rememberLedgerSearch(search: string): void {
  try {
    window.sessionStorage.setItem(LEDGER_SEARCH_KEY, serializeFilter(parseFilter(search)))
  } catch {
    return
  }
}

export function ledgerHref(): string {
  try {
    return `/transactions${serializeFilter(parseFilter(window.sessionStorage.getItem(LEDGER_SEARCH_KEY) ?? ''))}`
  } catch {
    return '/transactions'
  }
}
