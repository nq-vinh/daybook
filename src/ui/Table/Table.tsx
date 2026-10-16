import { useState, type KeyboardEvent, type ReactNode } from 'react'

import { Checkbox } from '../Checkbox/Checkbox'
import { cx } from '../classes'
import { Icon } from '../Icon/Icon'
import { rovingIndex, useElementMap, type RovingMove } from '../roving'
import styles from './Table.module.css'

const PAGE_ROWS = 10

const rowMoves: Partial<Record<string, { readonly move: RovingMove; readonly step?: number }>> = {
  ArrowDown: { move: 'next' },
  ArrowUp: { move: 'previous' },
  Home: { move: 'first' },
  End: { move: 'last' },
  PageDown: { move: 'next', step: PAGE_ROWS },
  PageUp: { move: 'previous', step: PAGE_ROWS },
}

export type SortDirection = 'ascending' | 'descending'
export type ColumnWidth = 'sm' | 'md' | 'lg'

export interface TableSort {
  readonly key: string
  readonly direction: SortDirection
}

export interface TableColumn<Row> {
  readonly key: string
  readonly header: string
  readonly cell: (row: Row) => ReactNode
  readonly align?: 'start' | 'end' | undefined
  readonly numeric?: boolean | undefined
  readonly sortable?: boolean | undefined
  readonly width?: ColumnWidth | undefined
}

export interface TableProps<Row> {
  readonly caption: string
  readonly hideCaption?: boolean | undefined
  readonly columns: readonly TableColumn<Row>[]
  readonly rows: readonly Row[]
  readonly getRowKey: (row: Row) => string
  readonly getRowLabel?: ((row: Row) => string) | undefined
  readonly sort?: TableSort | null | undefined
  readonly onSortChange?: ((sort: TableSort) => void) | undefined
  readonly selectable?: boolean | undefined
  readonly selectedKeys?: ReadonlySet<string> | undefined
  readonly onSelectionChange?: ((keys: ReadonlySet<string>) => void) | undefined
  readonly virtualised?: boolean | undefined
  readonly rowCount?: number | undefined
  readonly rowIndexOffset?: number | undefined
  readonly className?: string | undefined
}

export function nextSort(current: TableSort | null | undefined, key: string): TableSort {
  return current?.key === key && current.direction === 'ascending'
    ? { key, direction: 'descending' }
    : { key, direction: 'ascending' }
}

const emptySelection: ReadonlySet<string> = new Set()

export function Table<Row>({
  caption,
  hideCaption = false,
  columns,
  rows,
  getRowKey,
  getRowLabel,
  sort,
  onSortChange,
  selectable = false,
  selectedKeys = emptySelection,
  onSelectionChange,
  virtualised = false,
  rowCount,
  rowIndexOffset = 0,
  className,
}: TableProps<Row>) {
  const rowElements = useElementMap<HTMLTableRowElement>()
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const entries = rows.map((row) => ({ row, key: getRowKey(row) }))
  const keys = entries.map((entry) => entry.key)
  const focusKey = activeKey !== null && keys.includes(activeKey) ? activeKey : (keys[0] ?? null)
  const selectedCount = keys.filter((key) => selectedKeys.has(key)).length
  const allSelected = keys.length > 0 && selectedCount === keys.length

  function focusRow(key: string | undefined) {
    if (key === undefined) {
      return
    }

    setActiveKey(key)
    rowElements.get(key)?.focus()
  }

  function toggleRow(key: string) {
    const next = new Set(selectedKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    onSelectionChange?.(next)
  }

  function toggleAll() {
    const next = new Set(selectedKeys)
    for (const key of keys) {
      if (allSelected) {
        next.delete(key)
      } else {
        next.add(key)
      }
    }
    onSelectionChange?.(next)
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, index: number, key: string) {
    if (event.target !== event.currentTarget) {
      return
    }

    const target = rowMoves[event.key]

    if (target !== undefined) {
      event.preventDefault()
      focusRow(keys[rovingIndex(keys, index, target.move, { wrap: false, step: target.step })])
    } else if (event.key === ' ' && selectable) {
      event.preventDefault()
      toggleRow(key)
    }
  }

  function cellClass(column: TableColumn<Row>) {
    return cx(column.numeric === true && styles.numeric, column.align === 'end' && styles.end)
  }

  return (
    <table
      className={cx(styles.table, className)}
      role={virtualised ? 'grid' : undefined}
      aria-rowcount={virtualised && rowCount !== undefined ? rowCount + 1 : undefined}
      aria-multiselectable={virtualised && selectable ? true : undefined}
    >
      <caption className={cx(styles.caption, hideCaption && 'visually-hidden')}>{caption}</caption>
      <thead>
        <tr aria-rowindex={virtualised ? 1 : undefined}>
          {selectable && (
            <th scope="col" className={cx(styles.header, styles.select)}>
              <Checkbox
                label="Select all rows"
                hideLabel
                checked={allSelected}
                indeterminate={selectedCount > 0 && !allSelected}
                onChange={toggleAll}
              />
            </th>
          )}
          {columns.map((column) => {
            const sorted = sort?.key === column.key ? sort.direction : undefined

            return (
              <th
                key={column.key}
                scope="col"
                className={cx(styles.header, cellClass(column))}
                data-width={column.width}
                aria-sort={column.sortable === true ? sorted : undefined}
              >
                {column.sortable === true && onSortChange !== undefined ? (
                  <button
                    type="button"
                    className={styles.sort}
                    onClick={() => {
                      onSortChange(nextSort(sort, column.key))
                    }}
                  >
                    {column.header}
                    {sorted !== undefined && <Icon name={sorted === 'ascending' ? 'arrow-up' : 'arrow-down'} />}
                  </button>
                ) : column.header}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {entries.map(({ row, key }, index) => {
          const selected = selectedKeys.has(key)

          return (
            <tr
              key={key}
              ref={rowElements.register(key)}
              className={styles.row}
              tabIndex={key === focusKey ? 0 : -1}
              aria-selected={selectable ? selected : undefined}
              aria-rowindex={virtualised ? rowIndexOffset + index + 2 : undefined}
              onFocus={() => {
                setActiveKey(key)
              }}
              onKeyDown={(event) => {
                handleRowKeyDown(event, index, key)
              }}
            >
              {selectable && (
                <td className={styles.select}>
                  <Checkbox
                    label={`Select ${getRowLabel?.(row) ?? `row ${String(rowIndexOffset + index + 1)}`}`}
                    hideLabel
                    tabIndex={-1}
                    checked={selected}
                    onChange={() => {
                      toggleRow(key)
                    }}
                  />
                </td>
              )}
              {columns.map((column) => (
                <td key={column.key} className={cellClass(column)}>{column.cell(row)}</td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
