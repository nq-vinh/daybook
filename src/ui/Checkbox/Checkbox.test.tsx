import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('renders a native checkbox named by its visible label', () => {
    const { container } = render(<Checkbox label="Pending only" />)
    const checkbox = screen.getByRole('checkbox', { name: 'Pending only' })

    expect(checkbox).toHaveAttribute('type', 'checkbox')
    expect(screen.getByText('Pending only').closest('label')?.control).toBe(checkbox)
    expect(container.querySelector('[data-focus-ring]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('toggles with Space after Tab and with a click on the label', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox label="Pending only" onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Pending only' })

    await user.tab()
    expect(checkbox).toHaveFocus()
    await user.keyboard(' ')
    expect(checkbox).toBeChecked()
    await user.click(screen.getByText('Pending only'))
    expect(checkbox).not.toBeChecked()
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('applies indeterminate through the DOM property', () => {
    const ref = createRef<HTMLInputElement>()
    const { rerender } = render(<Checkbox label="Select all" indeterminate ref={ref} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Select all' })

    expect(checkbox).toBePartiallyChecked()
    expect(ref.current).toBe(checkbox)
    rerender(<Checkbox label="Select all" indeterminate={false} ref={ref} />)
    expect(checkbox).not.toBePartiallyChecked()
  })

  it('runs the cleanup returned by a callback ref and resets on unmount', () => {
    const cleanup = vi.fn()
    const attached: HTMLInputElement[] = []
    const { unmount } = render(
      <Checkbox
        label="Select all"
        indeterminate
        ref={(node) => {
          if (node !== null) {
            attached.push(node)
          }
          return cleanup
        }}
      />,
    )

    expect(attached).toEqual([screen.getByRole('checkbox', { name: 'Select all' })])
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('cannot be toggled when disabled', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="Pending only" disabled />)
    const checkbox = screen.getByRole('checkbox', { name: 'Pending only' })

    await user.click(checkbox)
    expect(checkbox).toBeDisabled()
    expect(checkbox).not.toBeChecked()
  })

  it('keeps the accessible name when the label is visually hidden', () => {
    render(<Checkbox label="Select all rows" hideLabel />)

    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toBeInTheDocument()
    expect(screen.getByText('Select all rows')).toHaveClass('visually-hidden')
  })
})
