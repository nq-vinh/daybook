import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Select } from './Select'

function AccountSelect() {
  const [account, setAccount] = useState('main')

  return (
    <>
      <Select label="Account" value={account} onChange={(event) => { setAccount(event.target.value) }}>
        <option value="main">Main EUR</option>
        <option value="ops">Operations USD</option>
      </Select>
      <output>{account}</output>
    </>
  )
}

describe('Select', () => {
  it('renders a native select with its label and a hidden chevron', () => {
    const { container } = render(<AccountSelect />)
    const select = screen.getByRole('combobox', { name: 'Account' })

    expect(select.tagName).toBe('SELECT')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes focus with Tab and updates a controlled value', async () => {
    const user = userEvent.setup()
    render(<AccountSelect />)
    const select = screen.getByRole('combobox', { name: 'Account' })

    await user.tab()
    expect(select).toHaveFocus()
    await user.selectOptions(select, 'Operations USD')
    expect(select).toHaveValue('ops')
    expect(screen.getByRole('status')).toHaveTextContent('ops')
  })

  it('wires description and error', () => {
    render(
      <Select label="Category" description="Used for VAT." error="Choose a category to continue.">
        <option value="">None</option>
      </Select>,
    )
    const select = screen.getByRole('combobox', { name: 'Category' })

    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Used for VAT. Choose a category to continue.')
  })
})
