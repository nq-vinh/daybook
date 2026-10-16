import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '../Button/Button'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders an h2 by default with the description', () => {
    render(<EmptyState title="No transactions" description="No transactions match these filters. Clear filters or widen the date range." />)

    expect(screen.getByRole('heading', { level: 2, name: 'No transactions' })).toBeInTheDocument()
    expect(screen.getByText(/Clear filters or widen the date range/)).toBeInTheDocument()
  })

  it('renders an h3 and the action slot when asked', () => {
    render(
      <EmptyState
        headingLevel={3}
        title="No budgets yet"
        description="Create a budget to track spending by category."
        action={<Button>Create budget</Button>}
      />,
    )

    expect(screen.getByRole('heading', { level: 3, name: 'No budgets yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create budget' })).toBeInTheDocument()
  })
})
