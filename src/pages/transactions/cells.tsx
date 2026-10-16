import { formatMoney } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import { CATEGORIES, type CategoryId, COUNTERPARTIES } from '../../domain/world'
import { useCategoryEdit } from '../../state/edits'
import { Badge } from '../../ui/Badge/Badge'
import { cx } from '../../ui/classes'
import styles from './cells.module.css'

const counterpartyNames = new Map<string, string>(COUNTERPARTIES.map((counterparty) => [counterparty.id, counterparty.name]))

const categoryLabels = new Map<string, string>(CATEGORIES.map((category) => [category.id, category.label]))

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

export function Status({ id }: { readonly id: number }) {
  const { status } = transaction(id)
  if (status === 'pending') {
    return <Badge>Pending</Badge>
  }
  return status === 'declined' ? <Badge tone="negative">Declined</Badge> : null
}

export function Amount({ id, side }: { readonly id: number; readonly side: 'debit' | 'credit' }) {
  const { amount, currency, status } = transaction(id)
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
