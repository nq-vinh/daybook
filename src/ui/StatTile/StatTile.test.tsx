import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatTile } from './StatTile'

describe('StatTile', () => {
  it('is a group named by its label with the formatted value', () => {
    render(<StatTile label="Main EUR" value="48,210.55" />)

    const tile = screen.getByRole('group', { name: 'Main EUR' })
    expect(tile).toHaveTextContent('48,210.55')
  })

  it('states the delta in text with its sign and tone', () => {
    render(
      <StatTile
        label="Main EUR"
        value="48,210.55"
        delta={{ value: '-2.4 %', label: 'vs last month', trend: 'down', tone: 'negative' }}
      />,
    )

    const delta = screen.getByText('-2.4 % vs last month')
    expect(delta.parentElement).toHaveAttribute('data-tone', 'negative')
    expect(delta.parentElement?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the children slot', () => {
    render(<StatTile label="Payroll EUR" value="9,400.00"><canvas aria-label="Trend" /></StatTile>)

    expect(screen.getByLabelText('Trend')).toBeInTheDocument()
  })
})
