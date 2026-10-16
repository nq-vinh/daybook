import { type KeyboardEvent, useState, useSyncExternalStore } from 'react'

import { Checkbox } from '../Checkbox/Checkbox'
import { cx } from '../classes'
import type { TableColumn, TableKey, TableRowState } from './Table'
import styles from './Table.module.css'

export interface RowDispatch<Key extends TableKey> {
  readonly register: (key: string, node: HTMLTableRowElement | null) => (() => void) | undefined
  readonly focus: (key: Key, index: number) => void
  readonly keyDown: (event: KeyboardEvent<HTMLTableRowElement>, key: Key, index: number) => void
  readonly toggle: (key: Key) => void
}

export interface TableRowProps<Row, Key extends TableKey, State extends string = string> {
  readonly row: Row
  readonly rowKey: Key
  readonly index: number
  readonly selected: boolean
  readonly focusable: boolean
  readonly rowFocus: boolean
  readonly selectable: boolean
  readonly virtualised: boolean
  readonly columns: readonly TableColumn<Row, State>[]
  readonly getRowLabel: ((row: Row) => string) | undefined
  readonly rowState: TableRowState<Key, State> | undefined
  readonly dispatch: RowDispatch<Key>
}

export function cellClass<Row, State extends string>(column: TableColumn<Row, State>): string | undefined {
  return cx(column.numeric === true && styles.numeric, column.align === 'end' && styles.end)
}

function unsubscribed(): void {
  return undefined
}

export function TableRow<Row, Key extends TableKey, State extends string = string>({
  row,
  rowKey,
  index,
  selected,
  focusable,
  rowFocus,
  selectable,
  virtualised,
  columns,
  getRowLabel,
  rowState,
  dispatch,
}: TableRowProps<Row, Key, State>) {
  const id = String(rowKey)
  const state = useSyncExternalStore(
    (listener) => rowState?.subscribe(rowKey, listener) ?? unsubscribed,
    () => rowState?.get(rowKey),
  )
  const [mountedState] = useState(state)

  return (
    <tr
      ref={(node) => dispatch.register(id, node)}
      className={styles.row}
      data-arrived={state !== undefined && state !== mountedState ? '' : undefined}
      tabIndex={rowFocus ? (focusable ? 0 : -1) : undefined}
      aria-selected={selectable ? selected : undefined}
      aria-rowindex={virtualised ? index + 2 : undefined}
      onFocus={rowFocus
        ? () => {
            dispatch.focus(rowKey, index)
          }
        : undefined}
      onKeyDown={rowFocus
        ? (event) => {
            dispatch.keyDown(event, rowKey, index)
          }
        : undefined}
    >
      {selectable && (
        <td className={styles.select}>
          <Checkbox
            label={`Select ${getRowLabel?.(row) ?? `row ${String(index + 1)}`}`}
            hideLabel
            tabIndex={rowFocus ? -1 : undefined}
            checked={selected}
            onChange={() => {
              dispatch.toggle(rowKey)
            }}
          />
        </td>
      )}
      {columns.map((column) => (
        <td key={column.key} className={cellClass(column)} data-truncate={column.truncate === true ? '' : undefined}>
          {column.cell(row, state)}
        </td>
      ))}
    </tr>
  )
}
