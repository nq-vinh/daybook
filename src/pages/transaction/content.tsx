import { useEffect, useId, useState } from 'react'

import { formatDate, formatMoney, formatPercent, formatRelative, formatSignedMoney } from '../../domain/format'
import { convert, roundHalfAwayFromZero } from '../../domain/fx'
import { transaction, type TransactionStatus } from '../../domain/transactions'
import { type Account, accountCurrency, type AccountId, ACCOUNTS, CARDS, CATEGORIES } from '../../domain/world'
import { Link } from '../../router/link'
import { setCategory, setNote, useCategoryEdit, useEdits } from '../../state/edits'
import { type SettledStatus, useFeedRow } from '../../state/feed'
import { ledgerHref } from '../../state/ledger-search'
import { Avatar } from '../../ui/Avatar/Avatar'
import { Badge } from '../../ui/Badge/Badge'
import { EmptyState } from '../../ui/EmptyState/EmptyState'
import { Select } from '../../ui/Select/Select'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { Table, type TableColumn } from '../../ui/Table/Table'
import { TextField } from '../../ui/TextField/TextField'
import { ledgerClient } from '../../worker/client'
import { Amount, CategoryLabel, counterpartyName, feedRows, Status, transactionHref } from '../transactions/cells'
import styles from '../transaction.module.css'

const HISTORY_LIMIT = 12

const statusBadges: Record<TransactionStatus, { readonly label: string; readonly tone: 'positive' | 'neutral' | 'negative' }> = {
  booked: { label: 'Booked', tone: 'positive' },
  pending: { label: 'Pending', tone: 'neutral' },
  declined: { label: 'Declined', tone: 'negative' },
}

const historyColumns: TableColumn<number, SettledStatus>[] = [
  {
    key: 'bookedAt',
    header: 'Date',
    cell: (id) => <Link to={transactionHref(id)}>{formatDate(transaction(id).bookedAt)}</Link>,
  },
  { key: 'category', header: 'Category', cell: (id) => <CategoryLabel id={id} /> },
  { key: 'debit', header: 'Debit', cell: (id, settled) => <Amount id={id} side="debit" settled={settled} />, numeric: true },
  { key: 'credit', header: 'Credit', cell: (id, settled) => <Amount id={id} side="credit" settled={settled} />, numeric: true },
  { key: 'status', header: 'Status', cell: (id, settled) => <Status id={id} settled={settled} /> },
]

function accountOf(accountId: AccountId): Account {
  const account = ACCOUNTS.find((candidate) => candidate.id === accountId)
  if (account === undefined) {
    throw new RangeError(`Unknown account: ${accountId}`)
  }
  return account
}

function identity(id: number): number {
  return id
}

function CategoryField({ id }: { readonly id: number }) {
  const category = useCategoryEdit(id) ?? transaction(id).category

  return (
    <Select
      label="Category"
      hideLabel
      className={styles.category}
      value={category}
      onChange={(event) => {
        const next = CATEGORIES.find((candidate) => candidate.id === event.currentTarget.value)
        if (next !== undefined) {
          setCategory(id, next.id)
        }
      }}
    >
      {CATEGORIES.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
      ))}
    </Select>
  )
}

function NotesField({ id }: { readonly id: number }) {
  const note = useEdits().notes[id] ?? ''

  return (
    <TextField
      multiline
      label="Notes"
      description="Saved when you leave the field."
      className={styles.notes}
      defaultValue={note}
      onBlur={(event) => {
        if (event.currentTarget.value !== note) {
          setNote(id, event.currentTarget.value)
        }
      }}
    />
  )
}

function CounterpartyHistory({ id, name }: { readonly id: number; readonly name: string }) {
  const { counterpartyId } = transaction(id)
  const [ids, setIds] = useState<Int32Array | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)

  useEffect(() => {
    let current = true

    ledgerClient.history(counterpartyId, HISTORY_LIMIT, id).then(
      (found) => {
        if (current) {
          setIds(found)
        }
      },
      (reason: unknown) => {
        if (current) {
          setFailure(reason instanceof Error ? reason : new Error('The counterparty history request failed.'))
        }
      },
    )

    return () => {
      current = false
    }
  }, [counterpartyId, id])

  if (failure !== null) {
    throw failure
  }

  if (ids === null) {
    return <Skeleton variant="text" lines={6} />
  }

  if (ids.length === 0) {
    return (
      <EmptyState
        headingLevel={3}
        compact
        title="No other transactions"
        description={`This is the only transaction with ${name} in the ledger.`}
      />
    )
  }

  return (
    <Table
      caption={`Last ${String(ids.length)} transactions with ${name}`}
      hideCaption
      columns={historyColumns}
      rows={ids}
      getRowKey={identity}
      rowState={feedRows}
    />
  )
}

export function TransactionContent({ id }: { readonly id: number }) {
  const entry = transaction(id)
  const settled = useFeedRow(id)
  const [backHref] = useState(ledgerHref)
  const detailsId = useId()
  const attachmentsId = useId()
  const historyId = useId()
  const name = counterpartyName(id)
  const account = accountOf(entry.accountId)
  const card = CARDS.find((candidate) => candidate.id === entry.cardId)
  const isDebit = entry.amount < 0
  const magnitude = Math.abs(entry.amount)
  const settlement = accountCurrency(entry.accountId)
  const vatAmount = roundHalfAwayFromZero((magnitude * entry.vatRate) / (100 + entry.vatRate))
  const status = statusBadges[settled ?? entry.status]

  return (
    <>
      <p className={styles.subtitle}>
        <span className={styles.subtitleName}>{name}</span>
        <span>{formatRelative(entry.bookedAt)}</span>
      </p>
      <p className={styles.back}>
        <Link to={backHref}>Back to ledger</Link>
      </p>

      <section className={styles.section} aria-labelledby={detailsId}>
        <h2 id={detailsId}>Details</h2>
        <dl className={styles.fields}>
          <div className={styles.field}>
            <dt>Date</dt>
            <dd>{formatDate(entry.bookedAt, undefined, { dateStyle: 'full' })}</dd>
          </div>
          <div className={styles.field}>
            <dt>Counterparty</dt>
            <dd className={styles.party}>
              <Avatar id={entry.counterpartyId} name={name} size="sm" decorative />
              <span>{name}</span>
            </dd>
          </div>
          <div className={styles.field}>
            <dt>Account</dt>
            <dd>{`${account.name} (${account.currency})`}</dd>
          </div>
          {card !== undefined && (
            <div className={styles.field}>
              <dt>Card</dt>
              <dd>{`${card.holder}, card ending ${card.last4}`}</dd>
            </div>
          )}
          <div className={styles.field}>
            <dt>Amount</dt>
            <dd>
              <span className={styles.amount}>{`${formatSignedMoney(entry.amount, entry.currency)} ${isDebit ? 'debit' : 'credit'}`}</span>
              {entry.currency !== settlement && (
                <span className={styles.secondary}>
                  {`${formatMoney(convert(magnitude, entry.currency, settlement), settlement)} at the fixed rate`}
                </span>
              )}
            </dd>
          </div>
          <div className={styles.field}>
            <dt>Category</dt>
            <dd><CategoryField id={id} /></dd>
          </div>
          <div className={styles.field}>
            <dt>Status</dt>
            <dd><Badge tone={status.tone}>{status.label}</Badge></dd>
          </div>
          <div className={styles.field}>
            <dt>Reference</dt>
            <dd>{entry.reference}</dd>
          </div>
          <div className={styles.field}>
            <dt>VAT rate</dt>
            <dd>{formatPercent(entry.vatRate / 100, undefined, 0)}</dd>
          </div>
          <div className={styles.field}>
            <dt>VAT amount</dt>
            <dd>{formatMoney(vatAmount, entry.currency)}</dd>
          </div>
          <div className={styles.field}>
            <dt>ID</dt>
            <dd>{String(id)}</dd>
          </div>
        </dl>
        <NotesField id={id} />
      </section>

      <section className={styles.section} aria-labelledby={attachmentsId}>
        <h2 id={attachmentsId}>Attachments</h2>
        <EmptyState compact headingLevel={3} title="No attachments yet." description="Attachments are not part of this demo." />
      </section>

      <section className={styles.section} aria-labelledby={historyId}>
        <h2 id={historyId}>Counterparty history</h2>
        <CounterpartyHistory id={id} name={name} />
      </section>
    </>
  )
}
