import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type PendingQuery, sharedLedgerClient } from '../../tests/unit/fake-ledger-client'
import { App } from '../app'
import { formatMoney } from '../domain/format'
import { accountAmount, TRANSACTION_COUNT, transaction } from '../domain/transactions'
import { ACCOUNTS } from '../domain/world'
import { navigate } from '../router/history'
import { RouterProvider } from '../router/router'
import { getEdits, setCategories } from '../state/edits'
import type { TableRowProps } from '../ui/Table/TableRow'
import type { LedgerResult } from '../worker/protocol'
import { notFound, routes } from './routes'
import styles from './transactions.module.css'

const profile = vi.hoisted(() => ({ commits: { sidebar: 0, totals: 0, ledger: 0 }, rows: 0 }))

type Profiled = keyof typeof profile.commits

function profiled(id: Profiled, children: ReactNode) {
  return (
    <Profiler
      id={id}
      onRender={() => {
        profile.commits[id] += 1
      }}
    >
      {children}
    </Profiler>
  )
}

vi.mock('../worker/client', async () => {
  const { sharedLedgerClient: shared } = await import('../../tests/unit/fake-ledger-client')
  return { ledgerClient: shared.client }
})

vi.mock('./transactions/ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transactions/ledger')>()
  return { ...actual, Ledger: (props: Parameters<typeof actual.Ledger>[0]) => profiled('ledger', <actual.Ledger {...props} />) }
})

vi.mock('./transactions/sidebar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transactions/sidebar')>()
  return { ...actual, FilterSidebar: (props: Parameters<typeof actual.FilterSidebar>[0]) => profiled('sidebar', <actual.FilterSidebar {...props} />) }
})

vi.mock('./transactions/totals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transactions/totals')>()
  return { ...actual, Totals: (props: Parameters<typeof actual.Totals>[0]) => profiled('totals', <actual.Totals {...props} />) }
})

vi.mock('../ui/Table/TableRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/Table/TableRow')>()
  return {
    ...actual,
    TableRow: (props: TableRowProps<number, number>) => {
      profile.rows += 1
      return <actual.TableRow {...props} />
    },
  }
})

const { calls } = sharedLedgerClient

function resultOf(ids: readonly number[]): LedgerResult {
  return {
    ids: Int32Array.from(ids),
    totals: { count: ids.length, debits: 123_456, credits: 7_890, net: 7_890 - 123_456, currency: 'EUR' },
  }
}

function result(count: number): LedgerResult {
  return resultOf(Array.from({ length: count }, (_, index) => index))
}

function findIds(predicate: (id: number) => boolean, wanted: number): number[] {
  const found: number[] = []
  for (let id = 0; id < TRANSACTION_COUNT && found.length < wanted; id += 1) {
    if (predicate(id)) {
      found.push(id)
    }
  }
  return found
}

async function respond(call: PendingQuery | undefined, value: LedgerResult): Promise<void> {
  if (call === undefined) {
    throw new Error('Expected a posted query.')
  }
  await act(async () => {
    call.settled = true
    call.resolve(value)
    await Promise.resolve()
  })
}

function latestCall(): PendingQuery | undefined {
  return calls.at(-1)
}

function resetProfile() {
  profile.commits = { sidebar: 0, totals: 0, ledger: 0 }
  profile.rows = 0
}

async function renderLedger(search = '', landed = result(40)) {
  navigate(`/transactions${search}`)
  const user = userEvent.setup()
  render(
    <RouterProvider routes={routes} notFound={notFound}>
      <App />
    </RouterProvider>,
  )
  await waitFor(() => {
    expect(calls.length).toBeGreaterThan(0)
  })
  await respond(latestCall(), landed)
  await screen.findByRole('grid', { name: 'Ledger' }).catch(() => null)
  return user
}

function grid(): HTMLElement {
  return screen.getByRole('grid', { name: 'Ledger' })
}

function bodyRows(): HTMLElement[] {
  return within(grid()).getAllByRole('row').slice(1)
}

beforeEach(() => {
  calls.length = 0
  resetProfile()
  window.localStorage.clear()
})

describe('TransactionsPage', () => {
  it('renders the virtualised ledger with the result count, indices and totals', async () => {
    await renderLedger('', result(5_000))

    expect(grid()).toHaveAttribute('aria-rowcount', '5001')
    expect(bodyRows()[0]).toHaveAttribute('aria-rowindex', '2')
    expect(bodyRows().length).toBeLessThan(40)
    const totals = screen.getByText('Transactions', { selector: 'dt' }).parentElement
    expect(totals).toHaveTextContent('5,000')
    expect(screen.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'false')
  })

  it('commits nothing in the sidebar, totals or ledger while typing, then the ledger once when the result lands', async () => {
    const user = await renderLedger()
    const posted = calls.length
    resetProfile()

    await user.type(screen.getByRole('searchbox', { name: 'Search transactions' }), 'a')

    await waitFor(() => {
      expect(calls).toHaveLength(posted + 1)
    })
    expect(window.location.search).toBe('?q=a')
    expect(latestCall()?.filter.q).toBe('a')
    expect(profile.commits).toEqual({ sidebar: 0, totals: 0, ledger: 0 })
    expect(profile.rows).toBe(0)

    await respond(latestCall(), result(5))

    expect(profile.commits.ledger).toBe(1)
    expect(profile.commits.sidebar).toBe(0)
    expect(bodyRows()).toHaveLength(5)
  })

  it('commits the ledger once for a sidebar filter change', async () => {
    const user = await renderLedger()
    const posted = calls.length
    resetProfile()

    await user.click(screen.getByRole('checkbox', { name: 'Software' }))

    expect(window.location.search).toBe('?cat=software')
    await waitFor(() => {
      expect(calls).toHaveLength(posted + 1)
    })
    expect(profile.commits.ledger).toBe(0)

    await respond(latestCall(), result(3))
    expect(profile.commits.ledger).toBe(1)
    expect(screen.getByText('1 active')).toBeInTheDocument()
  })

  it('pushes a history entry for filter changes and replaces for search', async () => {
    const user = await renderLedger()
    const length = window.history.length

    await user.click(screen.getByRole('checkbox', { name: 'Software' }))
    expect(window.history.length).toBe(length + 1)

    await user.type(screen.getByRole('searchbox', { name: 'Search transactions' }), 'ab')
    await waitFor(() => {
      expect(window.location.search).toBe('?q=ab&cat=software')
    })
    expect(window.history.length).toBe(length + 1)
  })

  it('reflects the URL in the sidebar and the header controls', async () => {
    await renderLedger('?q=rent&account=acc-ops&cat=rent&status=pending&from=2025-01-01')

    expect(screen.getByRole('searchbox', { name: 'Search transactions' })).toHaveValue('rent')
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('acc-ops')
    expect(screen.getByRole('checkbox', { name: 'Rent' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Pending' })).toBeChecked()
    expect(screen.getByLabelText('From')).toHaveValue('2025-01-01')
    expect(screen.getByText('3 active')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Balance' })).toBeNull()
  })

  it('shows running balances for one account sorted by date and hides them under other filters or sorts', async () => {
    const [newer = 0, older = 0] = findIds((id) => transaction(id).accountId === 'acc-main', 2)
    await renderLedger('?account=acc-main', resultOf([newer, older]))

    const opening = ACCOUNTS[0].openingBalance
    const olderBalance = opening + accountAmount(transaction(older))
    const newerBalance = olderBalance + accountAmount(transaction(newer))
    expect(screen.getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument()
    const [first, second] = bodyRows()
    expect([...(first ?? document.body).querySelectorAll('td')].at(-1)).toHaveTextContent(formatMoney(newerBalance, 'EUR'))
    expect([...(second ?? document.body).querySelectorAll('td')].at(-1)).toHaveTextContent(formatMoney(olderBalance, 'EUR'))
  })

  it('omits the balance column under the amount sort', async () => {
    await renderLedger('?account=acc-main&sort=amount:asc')

    expect(screen.queryByRole('columnheader', { name: 'Balance' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /Debit/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('marks debits, pending and declined rows without relying on colour', async () => {
    const [debit = 0] = findIds((id) => transaction(id).amount < 0 && transaction(id).status === 'booked', 1)
    const [pending = 0] = findIds((id) => transaction(id).status === 'pending', 1)
    const [declined = 0] = findIds((id) => transaction(id).status === 'declined', 1)
    await renderLedger('', resultOf([debit, pending, declined]))
    const [debitRow, pendingRow, declinedRow] = bodyRows()

    const { amount, currency } = transaction(debit)
    expect(within(debitRow ?? document.body).getByText('−').parentElement).toHaveTextContent(`−${formatMoney(-amount, currency)}`)
    expect(within(pendingRow ?? document.body).getByText('Pending')).toBeInTheDocument()
    const pendingAmount = [...(pendingRow ?? document.body).querySelectorAll('td')].find((cell) => cell.querySelector(`.${styles.pending ?? ''}`) !== null)
    expect(pendingAmount).toBeDefined()
    expect(within(declinedRow ?? document.body).getByText('Declined')).toBeInTheDocument()
  })

  it('writes the sort from the header buttons, mapping debit and credit to the amount sort', async () => {
    const user = await renderLedger()

    await user.click(screen.getByRole('button', { name: 'Credit' }))
    expect(window.location.search).toBe('?sort=amount:desc')

    await user.click(screen.getByRole('button', { name: /Credit/ }))
    expect(window.location.search).toBe('?sort=amount:asc')

    await user.click(screen.getByRole('button', { name: 'Date' }))
    expect(window.location.search).toBe('')
  })

  it('switches the account from the header and drops cards of other accounts', async () => {
    const user = await renderLedger('?card=card-01&q=x')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'acc-ops')
    expect(window.location.search).toBe('?q=x&account=acc-ops')
  })

  it('clears the sidebar filters but keeps the search, the account and the sort', async () => {
    const user = await renderLedger('?q=x&account=acc-main&cat=rent&status=pending&sort=status:asc')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(window.location.search).toBe('?q=x&account=acc-main&sort=status:asc')
  })

  it('shows the empty state with a clear filters action', async () => {
    const user = await renderLedger('?cat=rent', result(0))

    expect(screen.getByText('No transactions match these filters.')).toBeInTheDocument()
    expect(screen.getByText('Clear filters or widen the date range.')).toBeInTheDocument()
    expect(screen.queryByRole('grid')).toBeNull()
    const actions = screen.getAllByRole('button', { name: 'Clear filters' })
    await user.click(actions[actions.length - 1] ?? document.body)
    expect(window.location.search).toBe('')
  })

  it('categorises the selected rows in one edit, announces it and returns focus to the results', async () => {
    const user = await renderLedger()
    const posted = calls.length
    const [first, second] = bodyRows()

    await user.click(within(first ?? document.body).getByRole('checkbox'))
    await user.click(within(second ?? document.body).getByRole('checkbox'))

    const bar = screen.getByRole('region', { name: 'Selection' })
    expect(bar).toHaveTextContent('2 selected')
    await user.selectOptions(within(bar).getByRole('combobox', { name: 'Category' }), 'marketing')
    await user.click(within(bar).getByRole('button', { name: 'Categorise 2 transactions' }))

    expect(getEdits().categories[0]).toBe('marketing')
    expect(getEdits().categories[1]).toBe('marketing')
    expect(screen.queryByRole('region', { name: 'Selection' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Results' })).toHaveFocus()
    expect(await screen.findByText('Categorised 2 transactions as Marketing')).toBeInTheDocument()
    await waitFor(() => {
      expect(calls.length).toBeGreaterThan(posted)
    })
    setCategories([0, 1], null)
  })

  it('caps select all at 1,000 rows with a notice and an indeterminate header checkbox', async () => {
    const user = await renderLedger('', result(1_500))
    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' })

    await user.click(selectAll)

    const bar = screen.getByRole('region', { name: 'Selection' })
    expect(bar).toHaveTextContent('1,000 selected')
    expect(bar).toHaveTextContent('Selection limited to the first 1,000 rows')
    expect(selectAll).toBePartiallyChecked()

    await user.click(selectAll)
    expect(screen.queryByRole('region', { name: 'Selection' })).toBeNull()
  })

  it('clears the selection when the filter changes', async () => {
    const user = await renderLedger()

    await user.click(within(bodyRows()[0] ?? document.body).getByRole('checkbox'))
    expect(screen.getByRole('region', { name: 'Selection' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Booked' }))
    expect(screen.queryByRole('region', { name: 'Selection' })).toBeNull()
  })

  it('submits the header search from another page to the ledger and clears it on leaving', async () => {
    navigate('/cards')
    const user = userEvent.setup()
    render(
      <RouterProvider routes={routes} notFound={notFound}>
        <App />
      </RouterProvider>,
    )
    const field = screen.getByRole('searchbox', { name: 'Search transactions' })

    await user.type(field, 'rent{Enter}')

    expect(window.location.pathname).toBe('/transactions')
    expect(window.location.search).toBe('?q=rent')
    expect(field).toHaveValue('rent')

    await user.click(screen.getByRole('link', { name: 'Cards' }))
    expect(field).toHaveValue('')
  })
})
