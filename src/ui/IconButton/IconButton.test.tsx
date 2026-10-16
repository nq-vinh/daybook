import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Icon } from '../Icon/Icon'
import { IconButton } from './IconButton'

function PinToggle() {
  const [pinned, setPinned] = useState(false)

  return (
    <IconButton label="Pin account" pressed={pinned} onClick={() => { setPinned(!pinned) }}>
      <Icon name="check" />
    </IconButton>
  )
}

describe('IconButton', () => {
  it('takes its accessible name from the label and hides the icon', () => {
    render(<IconButton label="Open menu"><Icon name="chevron-down" /></IconButton>)
    const button = screen.getByRole('button', { name: 'Open menu' })

    expect(button).toHaveAttribute('type', 'button')
    expect(button).not.toHaveAttribute('aria-pressed')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('activates with Space and Enter', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<IconButton label="Open menu" onClick={onClick}><Icon name="chevron-down" /></IconButton>)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus()
    await user.keyboard(' ')
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('reflects a toggle state through aria-pressed', async () => {
    const user = userEvent.setup()
    render(<PinToggle />)
    const button = screen.getByRole('button', { name: 'Pin account' })

    expect(button).toHaveAttribute('aria-pressed', 'false')
    await user.tab()
    await user.keyboard(' ')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps its name while loading', () => {
    render(<IconButton label="Refresh" loading><Icon name="check" /></IconButton>)

    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-busy', 'true')
  })
})
