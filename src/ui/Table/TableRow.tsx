import type { KeyboardEvent } from 'react'

import { Checkbox } from '../Checkbox/Checkbox'
import { cx } from '../classes'
import type { TableColumn, TableKey } from './Table'
import styles from './Table.module.css'

export interface RowDispatch<Key extends TableKey> {
  readonly register: (key: string, node: HTMLTableRowElement | null) => (() => void) | undefined
  readonly focus: (key: Key, index: number) => void
  readonly keyDown: (event: KeyboardEvent<HTMLTableRowElement>, key: Key, index: number) => void
  readonly toggle: (key: Key) => void
}

export interface TableRowProps<Row, Key extends TableKey> {
  readonly row: Row
  readonly rowKey: Key
  readonly index: number
  readonly selected: boolean
  readonly focusable: boolean
  readonly selectable: boolean
  readonly virtualised: boolean
  readonly columns: readonly TableColumn<Row>[]
  readonly getRowLabel: ((row: Row) => string) | undefined
  readonly dispatch: RowDispatch<Key>
}

export function cellClass<Row>(column: TableColumn<Row>): string | undefined {
  return cx(column.numeric === true && styles.numeric, column.align === 'end' && styles.end)
}

export function TableRow<Row, Key extends TableKey>({
  row,
  rowKey,
  index,
  selected,
  focusable,
  selectable,
  virtualised,
  columns,
  getRowLabel,
  dispatch,
}: TableRowProps<Row, Key>) {
  const id = String(rowKey)

  return (
    <tr
      ref={(node) => dispatch.register(id, node)}
      className={styles.row}
      tabIndex={focusable ? 0 : -1}
      aria-selected={selectable ? selected : undefined}
      aria-rowindex={virtualised ? index + 2 : undefined}
      onFocus={() => {
        dispatch.focus(rowKey, index)
      }}
      onKeyDown={(event) => {
        dispatch.keyDown(event, rowKey, index)
      }}
    >
      {selectable && (
        <td className={styles.select}>
          <Checkbox
            label={`Select ${getRowLabel?.(row) ?? `row ${String(index + 1)}`}`}
            hideLabel
            tabIndex={-1}
            checked={selected}
            onChange={() => {
              dispatch.toggle(rowKey)
            }}
          />
        </td>
      )}
      {columns.map((column) => (
        <td key={column.key} className={cellClass(column)} data-truncate={column.truncate === true ? '' : undefined}>
          {column.cell(row)}
        </td>
      ))}
    </tr>
  )
}
