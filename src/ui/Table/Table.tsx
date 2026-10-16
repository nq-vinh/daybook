import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { Checkbox } from '../Checkbox/Checkbox'
import { cx } from '../classes'
import { Icon } from '../Icon/Icon'
import type { RovingMove } from '../roving'
import styles from './Table.module.css'
import { cellClass, type RowDispatch, TableRow } from './TableRow'
import {
  FALLBACK_ROW_HEIGHT,
  measureGeometry,
  pageStep,
  readWindow,
  sameWindow,
  viewport,
  windowAround,
  windowRange,
  type VirtualWindow,
} from './virtual'

const PAGE_ROWS = 10

const rowMoves: Partial<Record<string, { readonly move: RovingMove; readonly paged?: boolean }>> = {
  ArrowDown: { move: 'next' },
  ArrowUp: { move: 'previous' },
  Home: { move: 'first' },
  End: { move: 'last' },
  PageDown: { move: 'next', paged: true },
  PageUp: { move: 'previous', paged: true },
}

export type SortDirection = 'ascending' | 'descending'
export type ColumnWidth = 'sm' | 'md' | 'lg'
export type TableKey = string | number

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
  readonly truncate?: boolean | undefined
}

export interface TableProps<Row, Key extends TableKey = string> {
  readonly caption: string
  readonly hideCaption?: boolean | undefined
  readonly columns: readonly TableColumn<Row>[]
  readonly rows: ArrayLike<Row>
  readonly getRowKey: (row: Row) => Key
  readonly getRowLabel?: ((row: Row) => string) | undefined
  readonly sort?: TableSort | null | undefined
  readonly onSortChange?: ((sort: TableSort) => void) | undefined
  readonly selectable?: boolean | undefined
  readonly selectedKeys?: ReadonlySet<Key> | undefined
  readonly onSelectionChange?: ((keys: ReadonlySet<Key>) => void) | undefined
  readonly selectAllLimit?: number | undefined
  readonly onRowActivate?: ((row: Row) => void) | undefined
  readonly virtualised?: boolean | undefined
  readonly rowFocus?: boolean | undefined
  readonly className?: string | undefined
}

interface ActiveRow<Key> {
  readonly key: Key
  readonly index: number
}

interface Latest {
  readonly activeIndex: number | null
  readonly restingIndex: number | null
  readonly count: number
  readonly rowHeight: number
}

type RowHandlers<Key extends TableKey> = Omit<RowDispatch<Key>, 'register'>

function clampToRange(index: number, start: number, end: number): number {
  return Math.min(Math.max(index, start), end - 1)
}

export function nextSort(current: TableSort | null | undefined, key: string): TableSort {
  return current?.key === key && current.direction === 'ascending'
    ? { key, direction: 'descending' }
    : { key, direction: 'ascending' }
}

function clampedIndex(move: RovingMove, current: number, count: number, step: number): number {
  switch (move) {
    case 'first':
      return 0
    case 'last':
      return count - 1
    case 'next':
      return Math.min(count - 1, current + step)
    case 'previous':
      return Math.max(0, current - step)
  }
}

const emptySelection: ReadonlySet<never> = new Set()

export function Table<Row, Key extends TableKey = string>({
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
  selectAllLimit = Number.POSITIVE_INFINITY,
  onRowActivate,
  virtualised = false,
  rowFocus = virtualised,
  className,
}: TableProps<Row, Key>) {
  const elements = useRef<Map<string, HTMLTableRowElement> | null>(null)
  const handlers = useRef<RowHandlers<Key> | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const sentinelRef = useRef<HTMLTableRowElement>(null)
  const latest = useRef<Latest>({ activeIndex: null, restingIndex: null, count: 0, rowHeight: FALLBACK_ROW_HEIGHT })
  const [active, setActive] = useState<ActiveRow<Key> | null>(null)
  const [resting, setResting] = useState<number | null>(null)
  const [view, setView] = useState<VirtualWindow>(() => readWindow(0, viewport.height(), FALLBACK_ROW_HEIGHT))
  const requestedView = useRef(view)
  const [dispatch] = useState<RowDispatch<Key>>(() => ({
    register: (key, node) => {
      if (node === null) {
        return undefined
      }
      elements.current ??= new Map()
      const map = elements.current
      map.set(key, node)
      return () => {
        if (map.get(key) === node) {
          map.delete(key)
        }
      }
    },
    focus: (key, index) => {
      handlers.current?.focus(key, index)
    },
    keyDown: (event, key, index) => {
      handlers.current?.keyDown(event, key, index)
    },
    toggle: (key) => {
      handlers.current?.toggle(key)
    },
  }))

  const count = rows.length
  const { start, end } = virtualised ? windowRange(view, count) : { start: 0, end: count }
  const entries: { readonly row: Row; readonly key: Key; readonly index: number }[] = []

  for (let index = start; index < end; index += 1) {
    const row = rows[index]
    if (row !== undefined) {
      entries.push({ row, key: getRowKey(row), index })
    }
  }

  let activeIndex: number | null = null

  if (active !== null) {
    if (!virtualised) {
      const found = entries.findIndex((entry) => entry.key === active.key)
      activeIndex = found === -1 ? null : found
    } else {
      const atIndex = rows[active.index]
      if (atIndex !== undefined && getRowKey(atIndex) === active.key) {
        activeIndex = active.index
      } else {
        for (let index = 0; index < count; index += 1) {
          const row = rows[index]
          if (row !== undefined && getRowKey(row) === active.key) {
            activeIndex = index
            break
          }
        }
        setActive(activeIndex === null ? null : { key: active.key, index: activeIndex })
      }
    }
  }

  let fallbackIndex = 0

  if (virtualised) {
    fallbackIndex = resting !== null && resting < count ? resting : clampToRange(view.clear, start, end)
    if (fallbackIndex !== resting && count > 0) {
      setResting(fallbackIndex)
    }
  }

  const focusIndex = activeIndex ?? (count > 0 ? fallbackIndex : null)
  const focusRow = focusIndex === null ? undefined : rows[focusIndex]
  const focusEntry = focusIndex === null ? undefined : entries[focusIndex - start]
  const focusKey = focusEntry?.key ?? (focusRow === undefined ? null : getRowKey(focusRow))
  const holding = virtualised && activeIndex !== null && (activeIndex < start || activeIndex >= end)
  const selectionTarget = Math.min(count, selectAllLimit)
  const selectedCount = virtualised
    ? selectedKeys.size
    : entries.filter((entry) => selectedKeys.has(entry.key)).length
  const allSelected = selectedCount > 0 && selectedCount >= (virtualised ? count : entries.length)
  const columnCount = columns.length + (selectable ? 1 : 0)

  function element(key: string): HTMLTableRowElement | undefined {
    return elements.current?.get(key)
  }

  function measureView(body: HTMLTableSectionElement): VirtualWindow {
    const { top, height, rowHeight, stickyHeight } = measureGeometry(body, tableRef.current?.tHead ?? null, latest.current.rowHeight)
    return readWindow(top, height, rowHeight, stickyHeight)
  }

  function liveView(): VirtualWindow {
    return bodyRef.current === null ? view : measureView(bodyRef.current)
  }

  function focusAt(index: number) {
    const row = rows[index]

    if (row === undefined) {
      return
    }

    const key = getRowKey(row)

    if (!virtualised) {
      setActive({ key, index })
      element(String(key))?.focus()
      return
    }

    const current = liveView()
    const range = windowRange(current, count)
    const next = index >= range.start && index < range.end ? current : windowAround(index, current, count)

    requestedView.current = next
    flushSync(() => {
      setActive({ key, index })
      setView(next)
    })

    const target = element(String(key))
    if (target !== undefined) {
      target.focus({ preventScroll: true })
      viewport.reveal(target)
    }
  }

  function toggleRow(key: Key) {
    const next = new Set(selectedKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    onSelectionChange?.(next)
  }

  function toggleAll() {
    if (virtualised) {
      const next = new Set<Key>()
      if (selectedCount === 0) {
        for (let index = 0; index < selectionTarget; index += 1) {
          const row = rows[index]
          if (row !== undefined) {
            next.add(getRowKey(row))
          }
        }
      }
      onSelectionChange?.(next)
      return
    }

    const next = new Set(selectedKeys)
    for (const { key } of entries) {
      if (allSelected) {
        next.delete(key)
      } else {
        next.add(key)
      }
    }
    onSelectionChange?.(next)
  }

  function moveFrom(event: KeyboardEvent<HTMLTableRowElement>, index: number): boolean {
    const target = rowMoves[event.key]

    if (target === undefined || count === 0) {
      return false
    }

    event.preventDefault()
    const body = bodyRef.current
    const geometry = target.paged === true && virtualised && body !== null ? measureGeometry(body, tableRef.current?.tHead ?? null, view.rowHeight) : null
    const step = target.paged !== true ? 1 : geometry === null ? PAGE_ROWS : pageStep(geometry)
    focusAt(clampedIndex(target.move, index, count, step))
    return true
  }

  function activate(event: KeyboardEvent<HTMLTableRowElement>, index: number): boolean {
    const row = rows[index]
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey

    if (event.key !== 'Enter' || modified || onRowActivate === undefined || row === undefined) {
      return false
    }

    event.preventDefault()
    onRowActivate(row)
    return true
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, index: number, key: Key) {
    if (event.target !== event.currentTarget) {
      return
    }

    if (moveFrom(event, index)) {
      return
    }

    if (event.key === ' ' && selectable) {
      event.preventDefault()
      toggleRow(key)
      return
    }

    activate(event, index)
  }

  useLayoutEffect(() => {
    latest.current = { activeIndex, restingIndex: activeIndex === null && focusIndex !== null ? focusIndex : null, count, rowHeight: view.rowHeight }
    handlers.current = {
      focus: (key, index) => {
        setActive({ key, index })
      },
      keyDown: (event, key, index) => {
        handleRowKeyDown(event, index, key)
      },
      toggle: toggleRow,
    }
  })

  useLayoutEffect(() => {
    const body = bodyRef.current

    if (!virtualised || body === null) {
      return
    }

    function update(parking: boolean) {
      if (body === null) {
        return
      }

      const next = measureView(body)
      const focused = document.activeElement
      const { activeIndex: current, count: total } = latest.current

      if (parking && current !== null && focused !== null && focused !== sentinelRef.current && body.contains(focused)) {
        const range = windowRange(next, total)
        if (current < range.start || current >= range.end) {
          requestedView.current = next
          flushSync(() => {
            setView(next)
          })
          sentinelRef.current?.focus({ preventScroll: true })
          return
        }
      }

      if (sameWindow(requestedView.current, next)) {
        return
      }

      const { restingIndex } = latest.current
      if (parking && restingIndex !== null) {
        const range = windowRange(next, total)
        if (restingIndex < range.start || restingIndex >= range.end) {
          flushSync(() => {
            setResting(clampToRange(next.clear, range.start, range.end))
          })
        }
      }

      requestedView.current = next
      setView(next)
    }

    function changed() {
      update(true)
    }

    update(false)
    window.addEventListener('scroll', changed, { passive: true })
    window.addEventListener('resize', changed)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(changed)
    observer?.observe(document.body)

    return () => {
      window.removeEventListener('scroll', changed)
      window.removeEventListener('resize', changed)
      observer?.disconnect()
    }
  }, [virtualised])

  useLayoutEffect(() => {
    const body = bodyRef.current

    if (!virtualised || body === null) {
      return
    }

    body.style.setProperty('--table-space-before', `${String(start * view.rowHeight)}px`)
    body.style.setProperty('--table-space-after', `${String((count - end) * view.rowHeight)}px`)
  }, [virtualised, start, end, count, view.rowHeight])

  useLayoutEffect(() => {
    if (focusKey !== null && document.activeElement !== null && document.activeElement === sentinelRef.current) {
      elements.current?.get(String(focusKey))?.focus({ preventScroll: true })
    }
  })

  return (
    <table
      ref={tableRef}
      className={cx(styles.table, virtualised && styles.virtual, className)}
      role={virtualised ? 'grid' : undefined}
      aria-rowcount={virtualised ? count + 1 : undefined}
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
                data-column={column.key}
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
      <tbody ref={bodyRef} className={cx(virtualised && styles.body)}>
        {virtualised && (
          <tr
            ref={sentinelRef}
            className={styles.sentinel}
            data-sentinel=""
            tabIndex={holding ? 0 : -1}
            aria-hidden={holding ? undefined : true}
            aria-rowindex={holding && activeIndex !== null ? activeIndex + 2 : undefined}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || activeIndex === null) {
                return
              }
              if (event.key === ' ') {
                event.preventDefault()
                return
              }
              if (!activate(event, activeIndex)) {
                moveFrom(event, activeIndex)
              }
            }}
          >
            <td colSpan={columnCount}>
              {holding && activeIndex !== null
                ? `Row ${String(activeIndex + 1)} is scrolled out of view. Use the arrow keys to return to it.`
                : null}
            </td>
          </tr>
        )}
        {entries.map(({ row, key, index }) => (
          <TableRow
            key={String(key)}
            row={row}
            rowKey={key}
            index={index}
            selected={selectedKeys.has(key)}
            focusable={key === focusKey}
            rowFocus={rowFocus}
            selectable={selectable}
            virtualised={virtualised}
            columns={columns}
            getRowLabel={getRowLabel}
            dispatch={dispatch}
          />
        ))}
      </tbody>
    </table>
  )
}
