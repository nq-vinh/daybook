import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { moneyFormat, parseMoney } from './money'
import { NumberField } from './NumberField'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseMoney', () => {
  it('reads the locale separators and grouping', () => {
    expect(parseMoney('1,234.5', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney('1234.5', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney('.5', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: true, value: 50 })
    expect(parseMoney('1.500', moneyFormat('de-DE', 'EUR'))).toEqual({ ok: true, value: 150000 })
    expect(parseMoney('1 234,5', moneyFormat('fr-FR', 'EUR'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney('1 234,5', moneyFormat('fr-FR', 'EUR'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney('12,34,567', moneyFormat('en-IN', 'INR'))).toEqual({ ok: true, value: 123456700 })
    expect(parseMoney('', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: true, value: null })
  })

  it('accepts either apostrophe for Swiss grouping', () => {
    expect(parseMoney("1'234.50", moneyFormat('de-CH', 'CHF'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney('1’234.50', moneyFormat('de-CH', 'CHF'))).toEqual({ ok: true, value: 123450 })
  })

  it('fails cleanly on non-digit characters between groups', () => {
    expect(parseMoney('1,2a', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('1,2 3', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('1,2e3', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
  })

  it('parses pasted formatted amounts', () => {
    expect(parseMoney(new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', numberingSystem: 'latn' }).format(1234.5), moneyFormat('ar-EG', 'EGP'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney('£1,234.50', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney(' 1.234,50 € ', moneyFormat('de-DE', 'EUR'))).toEqual({ ok: true, value: 123450 })
    expect(parseMoney('EUR 1,234.50', moneyFormat('en-GB', 'EUR'))).toEqual({ ok: true, value: 123450 })
  })

  it('rejects group separators the locale would not write', () => {
    expect(parseMoney('1.5', moneyFormat('de-DE', 'EUR'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('1,5', moneyFormat('en-US', 'USD'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('1,2345', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney(',123', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('1.234,5,6', moneyFormat('de-DE', 'EUR'))).toEqual({ ok: false, reason: 'format' })
  })

  it('rejects extra fraction digits, minus signs, letters and oversize amounts', () => {
    expect(parseMoney('1.234', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('12.5', moneyFormat('en-GB', 'JPY'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('-5', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('12a', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('.', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'format' })
    expect(parseMoney('10000000000000', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: true, value: 1e15 })
    expect(parseMoney('10000000000000.01', moneyFormat('en-GB', 'GBP'))).toEqual({ ok: false, reason: 'too-large' })
  })
})

describe('NumberField', () => {
  it('renders a labelled decimal input', () => {
    render(<NumberField label="Amount" currency="GBP" locale="en-GB" />)
    const input = screen.getByRole('textbox', { name: 'Amount' })

    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveValue('')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('parses en-GB input into minor units, formats on blur and selects the editable draft on focus', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<NumberField label="Amount" currency="GBP" locale="en-GB" onValueChange={onValueChange} />)
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Amount' })

    await user.type(input, '1,234.5')
    expect(onValueChange).toHaveBeenLastCalledWith(123450)
    await user.tab()
    expect(input).toHaveValue('£1,234.50')
    await user.tab({ shift: true })
    expect(input).toHaveValue('1234.50')
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 7])
  })

  it('parses de-DE input with comma decimals and dot groups', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<NumberField label="Betrag" currency="EUR" locale="de-DE" onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox', { name: 'Betrag' })

    await user.type(input, '1.234,56')
    expect(onValueChange).toHaveBeenLastCalledWith(123456)
    await user.tab()
    expect(input).toHaveValue('1.234,56 €')
  })

  it('flags an invalid draft, reports null and keeps the draft on blur', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<NumberField label="Betrag" currency="EUR" locale="de-DE" onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox', { name: 'Betrag' })

    await user.type(input, '1.5')
    expect(onValueChange).toHaveBeenLastCalledWith(null)
    expect(input).not.toHaveAttribute('aria-invalid')
    await user.tab()
    expect(input).toHaveValue('1.5')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter an amount like 1.234,56 €.')

    await user.click(input)
    await user.keyboard('{End}00')
    expect(onValueChange).toHaveBeenLastCalledWith(150000)
    expect(input).not.toHaveAttribute('aria-invalid')
    await user.tab()
    expect(input).toHaveValue('1.500,00 €')
  })

  it('keeps the typed text when it has too many fraction digits', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<NumberField label="Amount" currency="JPY" locale="en-GB" onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox', { name: 'Amount' })

    await user.type(input, '12.5')
    expect(input).toHaveValue('12.5')
    expect(onValueChange).toHaveBeenLastCalledWith(null)
    await user.tab()
    expect(input).toHaveAccessibleDescription('Enter an amount like JP¥1,235.')
  })

  it('shows no format error while typing towards a valid amount, only on blur', async () => {
    const user = userEvent.setup()
    render(<NumberField label="Amount" currency="GBP" locale="en-GB" />)
    const input = screen.getByRole('textbox', { name: 'Amount' })

    await user.click(input)
    for (const key of ['1', ',', '2', '3']) {
      await user.keyboard(key)
      expect(input).not.toHaveAttribute('aria-invalid')
    }

    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('1,2')
    await user.tab()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter an amount like £1,234.56.')
  })

  it('says when an amount is too large', async () => {
    const user = userEvent.setup()
    render(<NumberField label="Amount" currency="GBP" locale="en-GB" />)

    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '99999999999999')
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveAccessibleDescription('Amount is too large.')
  })

  it('parses a pasted formatted amount', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<NumberField label="Amount" currency="GBP" locale="en-GB" onValueChange={onValueChange} />)

    await user.click(screen.getByRole('textbox', { name: 'Amount' }))
    await user.paste('£1,234.50')
    expect(onValueChange).toHaveBeenLastCalledWith(123450)
  })

  it('follows a controlled value and reports clearing as null', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { rerender } = render(
      <NumberField label="Amount" currency="GBP" locale="en-GB" value={500} onValueChange={onValueChange} />,
    )
    const input = screen.getByRole('textbox', { name: 'Amount' })
    expect(input).toHaveValue('£5.00')

    rerender(<NumberField label="Amount" currency="GBP" locale="en-GB" value={2500} onValueChange={onValueChange} />)
    expect(input).toHaveValue('£25.00')

    await user.clear(input)
    expect(onValueChange).toHaveBeenLastCalledWith(null)
  })

  it('refuses negative or fractional minor units at the boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => render(<NumberField label="Amount" currency="GBP" locale="en-GB" value={-1} />)).toThrow(/from 0 to/)
    expect(() => render(<NumberField label="Amount" currency="GBP" locale="en-GB" defaultValue={1.5} />)).toThrow(/from 0 to/)
  })

  it('submits minor units under its name and wires a consumer error', () => {
    const { container } = render(
      <NumberField label="Amount" currency="GBP" locale="en-GB" name="amount" defaultValue={1999} error="Enter an amount above zero." />,
    )

    expect(container.querySelector('input[type="hidden"][name="amount"]')).toHaveValue('1999')
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveAccessibleDescription('Enter an amount above zero.')
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveAttribute('aria-invalid', 'true')
  })
})
