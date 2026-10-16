import { type ReactNode, useState } from 'react'

import { formatDate, formatMoney } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import type { Currency } from '../../domain/world'
import { navigate } from '../../router/history'
import { Link } from '../../router/link'
import type { SortColumn, SortDirection } from '../../state/url'
import { Table, type TableColumn, type TableSort } from '../../ui/Table/Table'
import styles from '../transactions.module.css'
import { Amount, CategoryLabel, counterpartyName, Status, transactionHref } from './cells'
import { SELECTION_LIMIT, writeFilter } from './filters'

export interface LedgerProps {
  readonly ids: Int32Array
  readonly sortColumn: SortColumn
  readonly sortDir: SortDirection
  readonly balances: ReadonlyMap<number, number> | null
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

const baseColumns: TableColumn<number>[] = [
  { key: 'bookedAt', header: 'Date', cell: (id) => formatDate(transaction(id).bookedAt), sortable: true },
  {
    key: 'counterparty',
    header: 'Counterparty',
    cell: (id) => <Link to={transactionHref(id)} tabIndex={-1}>{counterpartyName(id)}</Link>,
    sortable: true,
    truncate: true,
  },
  { key: 'category', header: 'Category', cell: (id) => <CategoryLabel id={id} />, sortable: true, truncate: true },
  { key: 'status', header: 'Status', cell: (id) => <Status id={id} />, sortable: true },
  { key: 'debit', header: 'Debit', cell: (id) => <Amount id={id} side="debit" />, numeric: true, sortable: true },
  { key: 'credit', header: 'Credit', cell: (id) => <Amount id={id} side="credit" />, numeric: true, sortable: true },
]

function ScrollRegion({ children }: { readonly children: ReactNode }) {
  const [overflowing, setOverflowing] = useState(false)

  function wrapperRef(wrapper: HTMLDivElement | null) {
    if (wrapper === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => {
      setOverflowing(wrapper.scrollWidth > wrapper.clientWidth)
    })
    observer.observe(wrapper)
    if (wrapper.firstElementChild !== null) {
      observer.observe(wrapper.firstElementChild)
    }
    return () => {
      observer.disconnect()
    }
  }

  if (!overflowing) {
    return <div ref={wrapperRef} className={styles.scroll}>{children}</div>
  }

  return (
    <div ref={wrapperRef} className={styles.scroll} role="region" aria-label="Ledger, scrolls sideways" tabIndex={0}>
      {children}
    </div>
  )
}

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
          cell: (id: number) => {
            const balance = balances.get(id)
            return balance === undefined ? null : formatMoney(balance, balanceCurrency)
          },
        },
      ]

  return (
    <ScrollRegion>
      <Table
        caption="Ledger"
        hideCaption
        className={styles.ledger}
        columns={columns}
        rows={ids}
        getRowKey={identity}
        getRowLabel={rowLabel}
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
