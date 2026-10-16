import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProgressBar, progressState } from './ProgressBar'

describe('ProgressBar', () => {
  it('renders a labelled meter with visible value text', () => {
    render(<ProgressBar label="Software" value={420} max={1000} valueText="420.00 of 1,000.00" />)

    const meter = screen.getByRole('meter', { name: 'Software' })
    expect(meter).toHaveAttribute('value', '420')
    expect(meter).toHaveAttribute('max', '1000')
    expect(meter).toHaveAttribute('aria-valuetext', '420.00 of 1,000.00')
    expect(screen.getByText('420.00 of 1,000.00')).toBeVisible()
  })

  it.each([
    [790, 'normal'],
    [800, 'warning'],
    [999, 'warning'],
    [1000, 'over'],
    [1300, 'over'],
  ] as const)('switches state at 80 and 100 per cent (%i)', (value, state) => {
    expect(progressState(value, 0, 1000, undefined)).toBe(state)

    const { container } = render(<ProgressBar label="Travel" value={value} max={1000} valueText={String(value)} />)
    expect(container.firstElementChild).toHaveAttribute('data-state', state)
  })

  it('takes the warning threshold from high so semantics and visuals agree', () => {
    expect(progressState(600, 0, 1000, 500)).toBe('warning')
    expect(progressState(400, 0, 1000, 500)).toBe('normal')
    expect(progressState(1000, 0, 1000, 500)).toBe('over')

    const { container } = render(<ProgressBar label="Dining" value={0.6} high={0.5} valueText="60 %" />)
    expect(container.firstElementChild).toHaveAttribute('data-state', 'warning')
  })

  it('passes low, high and optimum through', () => {
    render(<ProgressBar label="Rent" value={0.5} low={0.3} high={0.8} optimum={0.2} valueText="50 %" />)

    const meter = screen.getByRole('meter', { name: 'Rent' })
    expect(meter).toHaveAttribute('low', '0.3')
    expect(meter).toHaveAttribute('high', '0.8')
    expect(meter).toHaveAttribute('optimum', '0.2')
  })
})
