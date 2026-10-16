import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

describe('Button', () => {
  it('renders a named button of type button', () => {
    render(<Button variant="primary">Save budget</Button>)

    expect(screen.getByRole('button', { name: 'Save budget' })).toHaveAttribute('type', 'button')
  })

  it('activates on click, Enter and Space after tabbing to it', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Freeze card</Button>)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Freeze card' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    await user.click(screen.getByRole('button', { name: 'Freeze card' }))
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('stays focusable but inert while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Save budget</Button>)
    const button = screen.getByRole('button', { name: 'Save budget' })

    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    await user.tab()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders its label once and keeps it as the accessible name while loading', () => {
    const { rerender } = render(<Button>Save budget</Button>)
    const button = screen.getByRole('button', { name: 'Save budget' })

    rerender(<Button loading>Save budget</Button>)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAccessibleName('Save budget')
    expect(within(button).getAllByText('Save budget')).toHaveLength(1)
  })

  it('does not submit its form on click, Enter or Space while loading', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <form
        aria-label="Budget"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <Button type="submit" loading>Save budget</Button>
      </form>,
    )

    await user.click(screen.getByRole('button', { name: 'Save budget' }))
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Save budget' })).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('is skipped by Tab when disabled', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Button disabled>Undo</Button>
        <Button>Categorise 3 transactions</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Categorise 3 transactions' })).toHaveFocus()
  })

  it('forwards its ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Undo</Button>)

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Undo' }))
  })
})
