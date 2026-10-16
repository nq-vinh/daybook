import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Table, type TableColumn, type TableSort } from './Table'
import styles from './Table.module.css'

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

  it('switches to grid semantics with row count and indices when virtualised', () => {
    render(
      <Table
        caption="Transactions"
        hideCaption
        columns={plainColumns}
        rows={makeRows(3)}
        getRowKey={(row) => row.id}
        virtualised
        rowCount={5000}
        rowIndexOffset={40}
      />,
    )

    const grid = screen.getByRole('grid', { name: 'Transactions' })
    expect(grid).toHaveAttribute('aria-rowcount', '5001')
    expect(screen.getAllByRole('row')[0]).toHaveAttribute('aria-rowindex', '1')
    expect(bodyRows().map((row) => row.getAttribute('aria-rowindex'))).toEqual(['42', '43', '44'])
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
    render(<Table caption="Transactions" columns={plainColumns} rows={makeRows(25)} getRowKey={(row) => row.id} />)

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
    const { rerender } = render(<Table caption="Transactions" columns={plainColumns} rows={makeRows(5)} getRowKey={(row) => row.id} />)

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const focused = bodyRows()[2]
    expect(focused).toHaveFocus()

    rerender(<Table caption="Transactions" columns={plainColumns} rows={makeRows(5)} getRowKey={(row) => row.id} />)
    expect(bodyRows()[2]).toBe(focused)
    expect(bodyRows()[2]).toHaveFocus()
    expect(bodyRows()[2]).toHaveAttribute('tabindex', '0')

    rerender(<Table caption="Transactions" columns={plainColumns} rows={[...makeRows(6)].reverse()} getRowKey={(row) => row.id} />)
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
