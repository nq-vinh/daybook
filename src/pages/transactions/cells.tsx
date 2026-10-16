import { useSyncExternalStore } from 'react'

import { formatMoney } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import { CATEGORIES, type CategoryId, COUNTERPARTIES, type Currency } from '../../domain/world'
import { useCategoryEdit } from '../../state/edits'
import { getRowOverride, type SettledStatus, subscribeRow } from '../../state/feed'
import { Badge } from '../../ui/Badge/Badge'
import { cx } from '../../ui/classes'
import type { TableRowState } from '../../ui/Table/Table'
import type { BalanceRows } from './balances'
import styles from './cells.module.css'

const counterpartyNames = new Map<string, string>(COUNTERPARTIES.map((counterparty) => [counterparty.id, counterparty.name]))

const categoryLabels = new Map<string, string>(CATEGORIES.map((category) => [category.id, category.label]))

export const feedRows: TableRowState<number, SettledStatus> = { subscribe: subscribeRow, get: getRowOverride }

export function transactionHref(id: number): string {
  return `/transactions/${String(id)}`
}

export function counterpartyName(id: number): string {
  return counterpartyNames.get(transaction(id).counterpartyId) ?? ''
}

export function categoryLabel(category: CategoryId): string {
  return categoryLabels.get(category) ?? category
}

export function CategoryLabel({ id }: { readonly id: number }) {
  const edited = useCategoryEdit(id)
  return categoryLabel(edited ?? transaction(id).category)
}

export interface FeedCellProps {
  readonly id: number
  readonly settled?: SettledStatus | undefined
}

export function Status({ id, settled }: FeedCellProps) {
  const status = settled ?? transaction(id).status
  if (status === 'pending') {
    return <Badge>Pending</Badge>
  }
  return status === 'declined' ? <Badge tone="negative">Declined</Badge> : null
}

export function Amount({ id, side, settled }: FeedCellProps & { readonly side: 'debit' | 'credit' }) {
  const { amount, currency, status: seeded } = transaction(id)
  const status = settled ?? seeded
  const isDebit = amount < 0

  if (isDebit !== (side === 'debit')) {
    return null
  }

  return (
    <span className={cx(status === 'pending' && styles.pending)}>
      {isDebit && <span className="visually-hidden">−</span>}
      {formatMoney(Math.abs(amount), currency)}
    </span>
  )
}

export function Balance({ id, rows, currency }: { readonly id: number; readonly rows: BalanceRows; readonly currency: Currency }) {
  const balance = useSyncExternalStore((listener) => rows.subscribe(id, listener), () => rows.get(id))
  return balance === undefined ? null : formatMoney(balance, currency)
}
