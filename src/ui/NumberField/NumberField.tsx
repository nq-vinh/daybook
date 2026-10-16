import { useState, type ChangeEvent, type FocusEvent } from 'react'

import { defaultLocale } from '../../domain/format'
import { joinMessages } from '../field'
import { TextField, type TextFieldProps } from '../TextField/TextField'
import {
  MAX_MINOR_UNITS,
  formatMoneyDisplay,
  formatMoneyEditable,
  moneyFormat,
  parseMoney,
  type MoneyFormat,
  type MoneyParseResult,
  type NonNegativeMinorUnits,
} from './money'

export type { NonNegativeMinorUnits }

export interface NumberFieldProps
  extends Omit<TextFieldProps, 'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode' | 'align' | 'name'> {
  readonly currency: string
  readonly locale?: string | undefined
  readonly value?: NonNegativeMinorUnits | null | undefined
  readonly defaultValue?: NonNegativeMinorUnits | null | undefined
  readonly onValueChange?: ((value: NonNegativeMinorUnits | null) => void) | undefined
  readonly name?: string | undefined
}

function assertMinorUnits(value: number | null | undefined, prop: string): void {
  if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > MAX_MINOR_UNITS)) {
    throw new Error(`NumberField ${prop} must be an integer of minor units from 0 to ${String(MAX_MINOR_UNITS)}, got ${String(value)}.`)
  }
}

function draftError(result: MoneyParseResult | null, format: MoneyFormat, showFormatError: boolean): string | undefined {
  if (result === null || result.ok) {
    return undefined
  }

  if (result.reason === 'too-large') {
    return 'Amount is too large.'
  }

  return showFormatError ? `Enter an amount like ${format.example}.` : undefined
}

export function NumberField({
  currency,
  locale = defaultLocale(),
  value,
  defaultValue = null,
  onValueChange,
  name,
  error,
  onFocus,
  onBlur,
  ...rest
}: NumberFieldProps) {
  assertMinorUnits(value, 'value')
  assertMinorUnits(defaultValue, 'defaultValue')

  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const [draft, setDraft] = useState<string | null>(null)
  const [showFormatError, setShowFormatError] = useState(false)
  const format = moneyFormat(locale, currency)
  const current = value === undefined ? uncontrolledValue : value
  const parsed = draft === null ? null : parseMoney(draft, format)

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    const input = event.currentTarget

    if (draft === null) {
      const editable = current === null ? '' : formatMoneyEditable(current, format)
      input.value = editable
      setDraft(editable)
    }

    input.select()
    onFocus?.(event)
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (parsed === null || parsed.ok) {
      setDraft(null)
    } else {
      setShowFormatError(true)
    }

    onBlur?.(event)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const result = parseMoney(event.target.value, format)
    const next = result.ok ? result.value : null

    setDraft(event.target.value)
    setUncontrolledValue(next)

    if (result.ok) {
      setShowFormatError(false)
    }

    onValueChange?.(next)
  }

  return (
    <>
      <TextField
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        align="end"
        error={joinMessages(draftError(parsed, format, showFormatError), error)}
        value={draft ?? (current === null ? '' : formatMoneyDisplay(current, format))}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
      />
      {name !== undefined && <input type="hidden" name={name} value={current ?? ''} />}
    </>
  )
}
