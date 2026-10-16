import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { TextField } from './TextField'

function ControlledReference() {
  const [reference, setReference] = useState('INV-1')

  return (
    <>
      <TextField label="Reference" value={reference} onChange={(event) => { setReference(event.target.value.toUpperCase()) }} />
      <output>{reference}</output>
    </>
  )
}

describe('TextField', () => {
  it('associates the visible label with the input', () => {
    render(<TextField label="Counterparty" />)

    const input = screen.getByRole('textbox', { name: 'Counterparty' })
    expect(input).toHaveAttribute('type', 'text')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('wires description and error through aria-describedby', () => {
    render(<TextField label="IBAN" description="22 characters, starting with DE." error="IBAN is too short. Add the missing digits." />)
    const input = screen.getByRole('textbox', { name: 'IBAN' })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('22 characters, starting with DE. IBAN is too short. Add the missing digits.')
  })

  it('accepts typing when uncontrolled', async () => {
    const user = userEvent.setup()
    render(<TextField label="Counterparty" defaultValue="Kessler" />)
    const input = screen.getByRole('textbox', { name: 'Counterparty' })

    await user.type(input, ' GmbH')
    expect(input).toHaveValue('Kessler GmbH')
  })

  it('follows a controlled value', async () => {
    const user = userEvent.setup()
    render(<ControlledReference />)

    await user.type(screen.getByRole('textbox', { name: 'Reference' }), '-a')
    expect(screen.getByRole('textbox', { name: 'Reference' })).toHaveValue('INV-1-A')
    expect(screen.getByRole('status')).toHaveTextContent('INV-1-A')
  })

  it('renders prefix and suffix slots and keeps Tab order', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TextField label="Search" prefix="Find" suffix="Enter" />
        <TextField label="Note" />
      </>,
    )

    expect(screen.getByText('Find')).toBeInTheDocument()
    expect(screen.getByText('Enter')).toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveFocus()
  })

  it('forwards its ref to the input', () => {
    const ref = createRef<HTMLInputElement>()
    render(<TextField label="Note" ref={ref} />)

    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Note' }))
  })
})
