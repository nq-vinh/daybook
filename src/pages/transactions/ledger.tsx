import { formatDate } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import type { Currency } from '../../domain/world'
import { navigate } from '../../router/history'
import { Link } from '../../router/link'
import type { SettledStatus } from '../../state/feed'
import type { SortColumn, SortDirection } from '../../state/url'
import { ScrollRegion } from '../../ui/ScrollRegion/ScrollRegion'
import { Table, type TableColumn, type TableSort } from '../../ui/Table/Table'
import styles from '../transactions.module.css'
import type { BalanceRows } from './balances'
import { Amount, Balance, CategoryLabel, counterpartyName, feedRows, Status, transactionHref } from './cells'
import { SELECTION_LIMIT, writeFilter } from './filters'

export interface LedgerProps {
  readonly ids: Int32Array
  readonly sortColumn: SortColumn
  readonly sortDir: SortDirection
  readonly balances: BalanceRows | null
  readonly balanceCurrency: Currency | null
  readonly selection: ReadonlySet<number>
  readonly onSelectionChange: (selection: ReadonlySet<number>) => void
}

const sortColumns: Partial<Record<string, { readonly column: SortColumn; readonly initial: SortDirection }>> = {
  bookedAt: { column: 'bookedAt', initial: 'desc' },
  counterparty: { column: 'counterparty', initial: 'asc' },
  category: { column: 'category', initial: 'asc' },
  status: { column: 'status', initial: 'asc' },
  debit: { column: 'amount', initial: 'asc' },
  credit: { column: 'amount', initial: 'desc' },
}

function tableSort(column: SortColumn, dir: SortDirection): TableSort {
  const direction = dir === 'asc' ? 'ascending' : 'descending'
  if (column === 'amount') {
    return { key: dir === 'asc' ? 'debit' : 'credit', direction }
  }
  return { key: column, direction }
}

function changeSort({ key }: TableSort): void {
  const target = sortColumns[key]
  if (target === undefined) {
    return
  }
  writeFilter((current) => ({
    ...current,
    sort: {
      column: target.column,
      dir: current.sort.column === target.column ? (current.sort.dir === 'asc' ? 'desc' : 'asc') : target.initial,
    },
  }))
}

function rowLabel(id: number): string {
  return `${counterpartyName(id)}, ${formatDate(transaction(id).bookedAt)}`
}

function openDetail(id: number): void {
  navigate(transactionHref(id))
}

const baseColumns: TableColumn<number, SettledStatus>[] = [
  { key: 'bookedAt', header: 'Date', cell: (id) => formatDate(transaction(id).bookedAt), sortable: true },
  {
    key: 'counterparty',
    header: 'Counterparty',
    cell: (id) => <Link to={transactionHref(id)} tabIndex={-1}>{counterpartyName(id)}</Link>,
    sortable: true,
    truncate: true,
  },
  { key: 'category', header: 'Category', cell: (id) => <CategoryLabel id={id} />, sortable: true, truncate: true },
  { key: 'status', header: 'Status', cell: (id, settled) => <Status id={id} settled={settled} />, sortable: true },
  {
    key: 'debit',
    header: 'Debit',
    cell: (id, settled) => <Amount id={id} side="debit" settled={settled} />,
    numeric: true,
    sortable: true,
  },
  {
    key: 'credit',
    header: 'Credit',
    cell: (id, settled) => <Amount id={id} side="credit" settled={settled} />,
    numeric: true,
    sortable: true,
  },
]

function identity(id: number): number {
  return id
}

export function Ledger({ ids, sortColumn, sortDir, balances, balanceCurrency, selection, onSelectionChange }: LedgerProps) {
  const columns = balances === null || balanceCurrency === null
    ? baseColumns
    : [
        ...baseColumns,
        {
          key: 'balance',
          header: 'Balance',
          numeric: true,
          cell: (id: number) => <Balance id={id} rows={balances} currency={balanceCurrency} />,
        },
      ]

  return (
    <ScrollRegion label="Ledger, scrolls sideways" className={styles.scroll}>
      <Table
        caption="Ledger"
        hideCaption
        className={styles.ledger}
        columns={columns}
        rows={ids}
        getRowKey={identity}
        getRowLabel={rowLabel}
        rowState={feedRows}
        sort={tableSort(sortColumn, sortDir)}
        onSortChange={changeSort}
        selectable
        selectedKeys={selection}
        onSelectionChange={onSelectionChange}
        selectAllLimit={SELECTION_LIMIT}
        onRowActivate={openDetail}
        virtualised
      />
    </ScrollRegion>
  )
}
