import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DateRangeField, RANGE_ORDER_ERROR } from './DateRangeField'

describe('DateRangeField', () => {
  it('groups two labelled date inputs under the legend', () => {
    render(<DateRangeField legend="Booking date" />)
    const group = screen.getByRole('group', { name: 'Booking date' })

    expect(group.tagName).toBe('FIELDSET')
    expect(screen.getByLabelText('From')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('To')).toHaveAttribute('type', 'date')
  })

  it('moves from start to end with Tab and reports ISO dates', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<DateRangeField legend="Booking date" onValueChange={onValueChange} />)

    await user.tab()
    expect(screen.getByLabelText('From')).toHaveFocus()
    await user.keyboard('2026-09-01')
    expect(onValueChange).toHaveBeenLastCalledWith({ from: '2026-09-01', to: null })
    await user.tab()
    expect(screen.getByLabelText('To')).toHaveFocus()
    await user.keyboard('2026-09-16')
    expect(onValueChange).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-16' })
    expect(screen.queryByText(RANGE_ORDER_ERROR)).toBeNull()
  })

  it('flags an end date before the start date and clears once fixed', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DateRangeField legend="Booking date" value={{ from: '2026-09-16', to: '2026-09-01' }} />)
    const to = screen.getByLabelText('To')

    expect(to).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true')
    expect(to).toHaveAccessibleDescription(RANGE_ORDER_ERROR)

    rerender(<DateRangeField legend="Booking date" value={{ from: '2026-09-16', to: '2026-09-16' }} />)
    expect(to).not.toHaveAttribute('aria-invalid')
    expect(to).not.toHaveAttribute('aria-describedby')

    const onValueChange = vi.fn()
    rerender(<DateRangeField legend="Booking date" value={{ from: '2026-09-16', to: '2026-09-16' }} onValueChange={onValueChange} />)
    await user.clear(to)
    expect(onValueChange).toHaveBeenLastCalledWith({ from: '2026-09-16', to: null })
  })

  it('shows the range error first and keeps a consumer error in the description', () => {
    render(
      <DateRangeField
        legend="Booking date"
        error="Choose dates inside the last 36 months."
        value={{ from: '2026-09-16', to: '2026-09-01' }}
      />,
    )

    expect(screen.getByLabelText('From')).toHaveAccessibleDescription(`${RANGE_ORDER_ERROR} Choose dates inside the last 36 months.`)
    expect(screen.getByText(RANGE_ORDER_ERROR, { exact: false }).parentElement).toHaveAttribute('aria-live', 'polite')
  })
})
