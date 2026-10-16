import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function Page({ fail }: { readonly fail: boolean }) {
  if (fail) {
    throw new Error('The ledger worker stopped.')
  }
  return <h1>Transactions</h1>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders the fallback with a reload button and the message in a disclosure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ErrorBoundary pathname="/transactions"><Page fail /></ErrorBoundary>)

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toHaveFocus()
    expect(screen.getByText('The page could not load. Reload to try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    const message = screen.getByText('The ledger worker stopped.')
    expect(message.closest('details')).not.toBeNull()
    expect(screen.getByText('Error details').tagName).toBe('SUMMARY')
  })

  it('keeps the fallback on the same pathname and resets when the pathname changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { rerender } = render(<ErrorBoundary pathname="/transactions"><Page fail /></ErrorBoundary>)

    rerender(<ErrorBoundary pathname="/transactions"><Page fail={false} /></ErrorBoundary>)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()

    rerender(<ErrorBoundary pathname="/cards"><Page fail={false} /></ErrorBoundary>)
    expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).toBeNull()
  })
})
