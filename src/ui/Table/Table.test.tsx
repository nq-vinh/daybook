import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Table, type TableColumn, type TableSort } from './Table'
import styles from './Table.module.css'
import { viewport } from './virtual'

interface Entry {
  readonly id: string
  readonly counterparty: string
  readonly amount: string
}

function makeRows(count: number): Entry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${String(index + 1)}`,
    counterparty: `Counterparty ${String(index + 1)}`,
    amount: `${String(index + 1)}.00`,
  }))
}

const columns: TableColumn<Entry>[] = [
  { key: 'counterparty', header: 'Counterparty', cell: (row) => row.counterparty, sortable: true, width: 'lg' },
  { key: 'amount', header: 'Debit', cell: (row) => row.amount, align: 'end', numeric: true, sortable: true },
]

const plainColumns: TableColumn<Entry>[] = columns.map((column) => ({ ...column, sortable: false }))

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1)
}

describe('Table', () => {
  it('renders a captioned table with plain semantics by default', () => {
    render(<Table caption="Transactions" columns={plainColumns} rows={makeRows(3)} getRowKey={(row) => row.id} />)

    const table = screen.getByRole('table', { name: 'Transactions' })
    expect(table).not.toHaveAttribute('aria-rowcount')
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Counterparty', 'Debit'])
    expect(bodyRows()).toHaveLength(3)
    expect(bodyRows()[0]).not.toHaveAttribute('aria-rowindex')
    expect(bodyRows()[0]).not.toHaveAttribute('aria-selected')
  })

  it('derives each row key once per render', () => {
    const getRowKey = vi.fn((row: Entry) => row.id)
    render(<Table caption="Transactions" columns={plainColumns} rows={makeRows(3)} getRowKey={getRowKey} />)

    expect(getRowKey).toHaveBeenCalledTimes(3)
  })

  it('switches to grid semantics and renders only the window plus overscan when virtualised', () => {
    render(
      <Table caption="Transactions" hideCaption columns={plainColumns} rows={makeRows(5000)} getRowKey={(row) => row.id} virtualised />,
    )

    const grid = screen.getByRole('grid', { name: 'Transactions' })
    expect(grid).toHaveAttribute('aria-rowcount', '5001')
    expect(screen.getAllByRole('row')[0]).toHaveAttribute('aria-rowindex', '1')
    const indices = bodyRows().map((row) => row.getAttribute('aria-rowindex'))
    expect(indices).toHaveLength(Math.floor((window.innerHeight - 1) / 36) + 1 + 4)
    expect(indices[0]).toBe('2')
    expect(bodyRows()[0]).toHaveAttribute('tabindex', '0')
  })

  it('cycles aria-sort through the header buttons', async () => {
    const user = userEvent.setup()

    function Sorted() {
      const [sort, setSort] = useState<TableSort | null>(null)
      return <Table caption="Transactions" columns={columns} rows={makeRows(3)} getRowKey={(row) => row.id} sort={sort} onSortChange={setSort} />
    }

    render(<Sorted />)
    const counterparty = screen.getByRole('columnheader', { name: 'Counterparty' })
    const debit = screen.getByRole('columnheader', { name: 'Debit' })
    expect(counterparty).not.toHaveAttribute('aria-sort')

    await user.click(within(counterparty).getByRole('button', { name: 'Counterparty' }))
    expect(counterparty).toHaveAttribute('aria-sort', 'ascending')
    await user.click(within(counterparty).getByRole('button'))
    expect(counterparty).toHaveAttribute('aria-sort', 'descending')
    await user.click(within(counterparty).getByRole('button'))
    expect(counterparty).toHaveAttribute('aria-sort', 'ascending')

    within(debit).getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(debit).toHaveAttribute('aria-sort', 'ascending')
    expect(counterparty).not.toHaveAttribute('aria-sort')
  })

  it('moves roving focus with arrows, Home, End and pages of ten', async () => {
    const user = userEvent.setup()
    render(<Table caption="Transactions" columns={plainColumns} rows={makeRows(25)} getRowKey={(row) => row.id} rowFocus />)

    expect(bodyRows().map((row) => row.tabIndex).filter((index) => index === 0)).toHaveLength(1)
    await user.tab()
    expect(bodyRows()[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(bodyRows()[2]).toHaveFocus()
    expect(bodyRows()[2]).toHaveAttribute('tabindex', '0')
    expect(bodyRows()[0]).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{ArrowUp}')
    expect(bodyRows()[1]).toHaveFocus()
    await user.keyboard('{PageDown}')
    expect(bodyRows()[11]).toHaveFocus()
    await user.keyboard('{PageDown}{PageDown}')
    expect(bodyRows()[24]).toHaveFocus()
    await user.keyboard('{PageUp}')
    expect(bodyRows()[14]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(bodyRows()[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(bodyRows()[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(bodyRows()[24]).toHaveFocus()
  })

  it('keeps focus on the same row key when rows re-render with fresh objects', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Table caption="Transactions" columns={plainColumns} rows={makeRows(5)} getRowKey={(row) => row.id} rowFocus />)

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const focused = bodyRows()[2]
    expect(focused).toHaveFocus()

    rerender(<Table caption="Transactions" columns={plainColumns} rows={makeRows(5)} getRowKey={(row) => row.id} rowFocus />)
    expect(bodyRows()[2]).toBe(focused)
    expect(bodyRows()[2]).toHaveFocus()
    expect(bodyRows()[2]).toHaveAttribute('tabindex', '0')

    rerender(<Table caption="Transactions" columns={plainColumns} rows={[...makeRows(6)].reverse()} getRowKey={(row) => row.id} rowFocus />)
    expect(screen.getByRole('row', { name: /Counterparty 3/ })).toHaveFocus()
    expect(screen.getByRole('row', { name: /Counterparty 3/ })).toHaveAttribute('tabindex', '0')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('row', { name: /Counterparty 2/ })).toHaveFocus()
  })

  it('selects rows, marks select all indeterminate when partial and toggles all', async () => {
    const user = userEvent.setup()

    function Selectable() {
      const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
      return (
        <Table
          caption="Transactions"
          columns={plainColumns}
          rows={makeRows(3)}
          getRowKey={(row) => row.id}
          getRowLabel={(row) => row.counterparty}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowFocus
        />
      )
    }

    render(<Selectable />)
    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' })
    expect(selectAll.closest('th')).toHaveClass(styles.header ?? 'missing', styles.select ?? 'missing')
    expect(bodyRows().map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false'])

    await user.click(screen.getByRole('checkbox', { name: 'Select Counterparty 2' }))
    expect(bodyRows()[1]).toHaveAttribute('aria-selected', 'true')
    expect(selectAll).toBePartiallyChecked()

    await user.click(selectAll)
    expect(selectAll).toBeChecked()
    expect(bodyRows().map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'true', 'true'])

    await user.click(selectAll)
    expect(selectAll).not.toBeChecked()
    expect(selectAll).not.toBePartiallyChecked()
    expect(bodyRows().map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false'])

    await user.tab()
    expect(bodyRows()[1]).toHaveFocus()
    await user.keyboard('{ArrowDown}[Space]')
    expect(bodyRows()[2]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('checkbox', { name: 'Select Counterparty 1' })).toHaveAttribute('tabindex', '-1')
  })
})

function fakeScroller(height: number) {
  let scrollY = 0
  vi.spyOn(viewport, 'height').mockReturnValue(height)
  vi.spyOn(viewport, 'top').mockImplementation(() => -scrollY)
  vi.spyOn(viewport, 'reveal').mockImplementation((element) => {
    const top = (Number(element.getAttribute('aria-rowindex')) - 2) * 36 - scrollY
    if (top < 0) {
      scrollY += top
    } else if (top + 36 > height) {
      scrollY += top + 36 - height
    }
    window.dispatchEvent(new Event('scroll'))
  })
  return {
    scrollTo(top: number) {
      scrollY = top
      act(() => {
        window.dispatchEvent(new Event('scroll'))
      })
    },
    get scrollY() {
      return scrollY
    },
  }
}

function focusedRowIndex(): string | null {
  return document.activeElement?.getAttribute('aria-rowindex') ?? null
}

describe('virtualised Table', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('moves focus over the whole virtual set with arrows, Home, End and pages of the visible count', async () => {
    const user = userEvent.setup()
    const scroller = fakeScroller(360)
    render(<Table caption="Ledger" columns={plainColumns} rows={makeRows(5000)} getRowKey={(row) => row.id} virtualised />)

    await user.tab()
    expect(focusedRowIndex()).toBe('2')

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(focusedRowIndex()).toBe('5')

    await user.keyboard('{End}')
    expect(focusedRowIndex()).toBe('5001')
    expect(scroller.scrollY).toBe(5000 * 36 - 360)
    expect(bodyRows()).toHaveLength(10 + 4)

    await user.keyboard('{Home}')
    expect(focusedRowIndex()).toBe('2')
    expect(scroller.scrollY).toBe(0)

    await user.keyboard('{PageDown}')
    expect(focusedRowIndex()).toBe('11')

    await user.keyboard('{PageUp}')
    expect(focusedRowIndex()).toBe('2')
  })

  it('parks focus on the sentinel when the focused row scrolls out and returns to the row on an arrow key', async () => {
    const user = userEvent.setup()
    const scroller = fakeScroller(360)
    render(<Table caption="Ledger" columns={plainColumns} rows={makeRows(5000)} getRowKey={(row) => row.id} virtualised />)

    await user.tab()
    await user.keyboard('{ArrowDown}')
    scroller.scrollTo(50_000)

    const sentinel = document.querySelector('[data-sentinel]')
    expect(document.activeElement).toBe(sentinel)
    expect(sentinel).toHaveAttribute('tabindex', '0')
    expect(sentinel).toHaveAttribute('aria-rowindex', '3')
    expect(sentinel).not.toHaveAttribute('aria-hidden')
    expect([...document.querySelectorAll('tbody tr:not([data-sentinel])')].every((row) => row.getAttribute('tabindex') === '-1')).toBe(true)

    await user.keyboard('{ArrowDown}')
    expect(focusedRowIndex()).toBe('4')
    expect(document.activeElement).not.toBe(sentinel)
    expect(sentinel).toHaveAttribute('aria-hidden', 'true')
    expect(sentinel).toHaveAttribute('tabindex', '-1')
  })

  it('returns focus from the sentinel to the row when it scrolls back into the window', async () => {
    const user = userEvent.setup()
    const scroller = fakeScroller(360)
    render(<Table caption="Ledger" columns={plainColumns} rows={makeRows(5000)} getRowKey={(row) => row.id} virtualised />)

    await user.tab()
    scroller.scrollTo(50_000)
    expect(document.activeElement).toBe(document.querySelector('[data-sentinel]'))

    scroller.scrollTo(0)
    expect(focusedRowIndex()).toBe('2')
    expect(document.activeElement?.hasAttribute('data-sentinel')).toBe(false)
  })

  it('re-renders only the rows that enter the window when it moves', async () => {
    const user = userEvent.setup()
    const scroller = fakeScroller(360)
    const cell = vi.fn((row: Entry) => row.counterparty)
    render(
      <Table
        caption="Ledger"
        columns={[{ key: 'counterparty', header: 'Counterparty', cell }]}
        rows={makeRows(5000)}
        getRowKey={(row) => row.id}
        virtualised
      />,
    )
    await user.tab()
    cell.mockClear()

    scroller.scrollTo(36)

    expect(cell.mock.calls.map(([row]) => row.id)).toEqual(['t15'])
  })

  it('caps select all at the limit across the whole set', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    render(
      <Table
        caption="Ledger"
        columns={plainColumns}
        rows={makeRows(5000)}
        getRowKey={(row) => row.id}
        virtualised
        selectable
        selectAllLimit={3}
        onSelectionChange={onSelectionChange}
      />,
    )

    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' })
    await user.click(selectAll)
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['t1', 't2', 't3']))
  })

  it('activates the focused row on Enter without modifiers, toggles selection on Space and ignores Enter on the row checkbox', async () => {
    const user = userEvent.setup()
    const activate = vi.fn()
    const toggled = vi.fn()
    const rows = makeRows(3)
    render(
      <Table
        caption="Ledger"
        columns={plainColumns}
        rows={rows}
        getRowKey={(row) => row.id}
        selectable
        onSelectionChange={toggled}
        onRowActivate={activate}
        rowFocus
      />,
    )

    act(() => {
      bodyRows()[1]?.focus()
    })
    await user.keyboard('{Enter}')
    expect(activate).toHaveBeenCalledExactlyOnceWith(rows[1])

    await user.keyboard('{Control>}{Enter}{/Control}{Shift>}{Enter}{/Shift}{Alt>}{Enter}{/Alt}{Meta>}{Enter}{/Meta}')
    expect(activate).toHaveBeenCalledTimes(1)

    await user.keyboard(' ')
    expect(activate).toHaveBeenCalledTimes(1)
    expect(toggled).toHaveBeenCalledExactlyOnceWith(new Set(['t2']))

    act(() => {
      within(bodyRows()[1] ?? document.body).getByRole('checkbox').focus()
    })
    await user.keyboard('{Enter}')
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('activates the held row on Enter from the sentinel', async () => {
    const user = userEvent.setup()
    const activate = vi.fn()
    const scroller = fakeScroller(360)
    const rows = makeRows(5000)
    render(<Table caption="Ledger" columns={plainColumns} rows={rows} getRowKey={(row) => row.id} onRowActivate={activate} virtualised />)

    act(() => {
      bodyRows()[0]?.focus()
    })
    scroller.scrollTo(30_000)
    const sentinel = document.querySelector<HTMLElement>('tr[data-sentinel]')
    expect(sentinel).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(activate).toHaveBeenCalledExactlyOnceWith(rows[0])
  })

  it('keeps plain rows out of the tab order without row focus, with tabbable checkboxes and no row keys', async () => {
    const user = userEvent.setup()
    const activate = vi.fn()
    render(<Table caption="History" columns={plainColumns} rows={makeRows(3)} getRowKey={(row) => row.id} selectable onRowActivate={activate} />)

    for (const row of bodyRows()) {
      expect(row).not.toHaveAttribute('tabindex')
    }
    await user.tab()
    await user.tab()
    expect(within(bodyRows()[0] ?? document.body).getByRole('checkbox')).toHaveFocus()
    act(() => {
      bodyRows()[0]?.focus()
    })
    await user.keyboard('{Enter}{ArrowDown}')
    expect(activate).not.toHaveBeenCalled()
  })

  it('keeps the resting tab stop on its row while the window moves without leaving it', () => {
    const scroller = fakeScroller(360)
    render(<Table caption="Ledger" columns={plainColumns} rows={makeRows(5000)} getRowKey={(row) => row.id} virtualised />)
    const stop = () => document.querySelector('tbody tr[tabindex="0"]')?.getAttribute('aria-rowindex')

    const first = stop()
    scroller.scrollTo(36 * 3)
    expect(stop()).toBe(first)

    scroller.scrollTo(36 * 400)
    const moved = stop()
    expect(moved).not.toBe(first)
    expect(Number(moved)).toBeGreaterThan(390)
  })
})
