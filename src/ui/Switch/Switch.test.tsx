import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Switch } from './Switch'

function ControlledSwitch({ onChange }: { readonly onChange: (checked: boolean) => void }) {
  const [frozen, setFrozen] = useState(true)

  return (
    <Switch
      label="Card frozen"
      checked={frozen}
      onChange={(event) => {
        setFrozen(event.target.checked)
        onChange(event.target.checked)
      }}
    />
  )
}

describe('Switch', () => {
  it('exposes switch semantics on a native checkbox', () => {
    render(<Switch label="Live feed" />)
    const control = screen.getByRole('switch', { name: 'Live feed' })

    expect(control).toHaveAttribute('type', 'checkbox')
    expect(control).not.toHaveAttribute('aria-checked')
    expect(control).not.toBeChecked()
  })

  it('toggles on Space and click, not on Enter', async () => {
    const user = userEvent.setup()
    render(<Switch label="Live feed" />)
    const control = screen.getByRole('switch', { name: 'Live feed' })

    await user.tab()
    expect(control).toHaveFocus()
    await user.keyboard(' ')
    expect(control).toBeChecked()
    await user.keyboard('{Enter}')
    expect(control).toBeChecked()
    await user.click(screen.getByText('Live feed'))
    expect(control).not.toBeChecked()
  })

  it('starts from defaultChecked when uncontrolled', () => {
    render(<Switch label="Live feed" defaultChecked />)

    expect(screen.getByRole('switch', { name: 'Live feed' })).toBeChecked()
  })

  it('passes the native change event through and follows a controlled value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ControlledSwitch onChange={onChange} />)
    const control = screen.getByRole('switch', { name: 'Card frozen' })

    expect(control).toBeChecked()
    await user.click(control)
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(control).not.toBeChecked()
  })
})
