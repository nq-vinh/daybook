import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sharedLedgerClient } from '../../tests/unit/fake-ledger-client'
import { App } from '../app'
import { formatMoney, formatRelative } from '../domain/format'
import { convert } from '../domain/fx'
import { TRANSACTION_COUNT, transaction } from '../domain/transactions'
import { accountCurrency, CARDS, CATEGORIES, COUNTERPARTIES } from '../domain/world'
import { navigate } from '../router/history'
import { RouterProvider } from '../router/router'
import { getEdits, setNote } from '../state/edits'
import { LEDGER_SEARCH_KEY } from '../state/ledger-search'
import { cancelAllForTest } from '../state/optimistic'
import { dismissAllToasts } from '../state/toast'
import { notFound, routes } from './routes'
import { parseTransactionId } from './transaction'

vi.mock('../worker/client', async () => {
  const { sharedLedgerClient: shared } = await import('../../tests/unit/fake-ledger-client')
  return { ledgerClient: shared.client }
})

const ID = 4_242

function counterpartyNameOf(id: number): string {
  return COUNTERPARTIES.find((counterparty) => counterparty.id === transaction(id).counterpartyId)?.name ?? ''
}

function findId(predicate: (id: number) => boolean): number {
  for (let id = 0; id < TRANSACTION_COUNT; id += 1) {
    if (predicate(id)) {
      return id
    }
  }
  throw new Error('No transaction matches.')
}

function field(term: string): HTMLElement {
  const dt = screen.getByText(term, { selector: 'dt' })
  const dd = dt.nextElementSibling
  if (!(dd instanceof HTMLElement)) {
    throw new Error(`No value for ${term}.`)
  }
  return dd
}

async function renderDetail(id = ID) {
  navigate(`/transactions/${String(id)}`)
  const user = userEvent.setup()
  render(
    <RouterProvider routes={routes} notFound={notFound}>
      <App />
    </RouterProvider>,
  )
  await screen.findByRole('heading', { level: 2, name: 'Details' })
  return user
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cancelAllForTest()
  dismissAllToasts()
  vi.restoreAllMocks()
})

describe('parseTransactionId', () => {
  it('accepts canonical integers within the ledger and rejects everything else', () => {
    expect(parseTransactionId('0')).toBe(0)
    expect(parseTransactionId('99999')).toBe(99_999)
    for (const raw of [undefined, '', '100000', '-1', '01', '1e3', '1.0', ' 1', 'abc']) {
      expect(parseTransactionId(raw)).toBeNull()
    }
  })
})

describe('TransactionPage', () => {
  it('shows the subtitle, the fields and the back link to the remembered ledger query', async () => {
    window.sessionStorage.setItem(LEDGER_SEARCH_KEY, '?cat=travel&q=taxi')
    await renderDetail()
    const entry = transaction(ID)

    expect(screen.getByRole('heading', { level: 1, name: 'Transaction' })).toBeInTheDocument()
    expect(screen.getAllByText(counterpartyNameOf(ID)).length).toBeGreaterThan(0)
    expect(screen.getByText(formatRelative(entry.bookedAt))).toBeInTheDocument()
    expect(screen.getByText(entry.reference)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to ledger' })).toHaveAttribute('href', '/transactions?q=taxi&cat=travel')
    expect(screen.getByRole('heading', { level: 3, name: 'No attachments yet.' })).toBeInTheDocument()
  })

  it('falls back to the plain ledger when no query is remembered', async () => {
    await renderDetail()

    expect(screen.getByRole('link', { name: 'Back to ledger' })).toHaveAttribute('href', '/transactions')
  })

  it('shows the category change at once, commits it after the latency and saves the note on blur only when it changed', async () => {
    const user = await renderDetail()
    const target = CATEGORIES.find((category) => category.id !== transaction(ID).category)
    if (target === undefined) {
      throw new Error('Expected another category.')
    }

    const select = screen.getByRole('combobox', { name: 'Category' })
    await user.selectOptions(select, target.label)
    expect(select).toHaveValue(target.id)
    expect(getEdits().categories[ID]).toBeUndefined()
    expect(screen.getByText(`Categorised as ${target.label}`)).toBeInTheDocument()
    await waitFor(() => {
      expect(getEdits().categories[ID]).toBe(target.id)
    })
    expect(select).toHaveValue(target.id)

    const notes = screen.getByRole('textbox', { name: 'Notes' })
    await user.type(notes, 'Check the receipt')
    expect(getEdits().notes[ID]).toBeUndefined()
    await user.tab()
    expect(getEdits().notes[ID]).toBe('Check the receipt')
  })

  it('leaves the edits untouched when the notes field blurs without a change', async () => {
    setNote(ID, 'Existing note')
    const user = await renderDetail()
    const before = getEdits()

    await user.click(screen.getByRole('textbox', { name: 'Notes' }))
    await user.tab()

    expect(getEdits()).toBe(before)
  })

  it('shows the VAT amount, the card line and the converted amount only when the currencies differ', async () => {
    const foreign = findId((id) => {
      const entry = transaction(id)
      return entry.currency !== accountCurrency(entry.accountId) && entry.vatRate === 19 && entry.cardId !== undefined
    })
    const entry = transaction(foreign)
    const card = CARDS.find((candidate) => candidate.id === entry.cardId)
    await renderDetail(foreign)
    const magnitude = Math.abs(entry.amount)

    expect(field('VAT rate')).toHaveTextContent('19%')
    expect(field('VAT amount')).toHaveTextContent(formatMoney(Math.round((magnitude * 19) / 119), entry.currency))
    expect(field('Card')).toHaveTextContent(`${card?.holder ?? ''}, card ending ${card?.last4 ?? ''}`)
    const settlement = accountCurrency(entry.accountId)
    expect(field('Amount')).toHaveTextContent(`${formatMoney(convert(magnitude, entry.currency, settlement), settlement)} at the fixed rate`)
  })

  it('hides the converted amount and the card line when they do not apply', async () => {
    const local = findId((id) => {
      const entry = transaction(id)
      return entry.currency === accountCurrency(entry.accountId) && entry.cardId === undefined
    })
    await renderDetail(local)

    expect(field('Amount')).not.toHaveTextContent('at the fixed rate')
    expect(screen.queryByText('Card', { selector: 'dt' })).toBeNull()
  })

  it('requests the last 12 transactions with the counterparty excluding this one and links each row', async () => {
    const history = vi.spyOn(sharedLedgerClient.client, 'history').mockResolvedValue(Int32Array.from([ID + 1, ID + 2]))
    await renderDetail()

    expect(history).toHaveBeenCalledWith(transaction(ID).counterpartyId, 12, ID)
    const table = await screen.findByRole('table', { name: `Last 2 transactions with ${counterpartyNameOf(ID)}` })
    const links = within(table).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([`/transactions/${String(ID + 1)}`, `/transactions/${String(ID + 2)}`])
  })
})
