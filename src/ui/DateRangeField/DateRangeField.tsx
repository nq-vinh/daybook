import { useState, type ChangeEvent } from 'react'

import { cx } from '../classes'
import { FieldError, fieldStyles, joinMessages, useFieldIds } from '../field'
import styles from './DateRangeField.module.css'

export interface DateRange {
  readonly from: string | null
  readonly to: string | null
}

export interface DateRangeFieldProps {
  readonly legend: string
  readonly id?: string | undefined
  readonly value?: DateRange | undefined
  readonly defaultValue?: DateRange | undefined
  readonly onValueChange?: ((value: DateRange) => void) | undefined
  readonly description?: string | undefined
  readonly error?: string | undefined
  readonly min?: string | undefined
  readonly max?: string | undefined
  readonly fromName?: string | undefined
  readonly toName?: string | undefined
  readonly disabled?: boolean | undefined
  readonly required?: boolean | undefined
  readonly className?: string | undefined
}

export const RANGE_ORDER_ERROR = 'End date must be on or after the start date.'

const EMPTY_RANGE: DateRange = { from: null, to: null }

export function DateRangeField({
  legend,
  id,
  value,
  defaultValue = EMPTY_RANGE,
  onValueChange,
  description,
  error,
  min,
  max,
  fromName,
  toName,
  disabled,
  required,
  className,
}: DateRangeFieldProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const range = value ?? uncontrolledValue
  const rangeError = range.from !== null && range.to !== null && range.from > range.to ? RANGE_ORDER_ERROR : undefined
  const message = joinMessages(rangeError, error)
  const { controlId, descriptionId, errorId, describedBy } = useFieldIds(id, description, message)

  function update(part: keyof DateRange) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...range, [part]: event.target.value === '' ? null : event.target.value }
      setUncontrolledValue(next)
      onValueChange?.(next)
    }
  }

  return (
    <fieldset className={cx(styles.fieldset, className)} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>
      {description !== undefined && <p id={descriptionId} className={fieldStyles.description}>{description}</p>}
      <div className={styles.inputs}>
        <div className={styles.part}>
          <label className={styles.partLabel} htmlFor={`${controlId}-from`}>From</label>
          <input
            id={`${controlId}-from`}
            className={styles.input}
            type="date"
            name={fromName}
            value={range.from ?? ''}
            min={min}
            max={max}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={message === undefined ? undefined : true}
            onChange={update('from')}
          />
        </div>
        <div className={styles.part}>
          <label className={styles.partLabel} htmlFor={`${controlId}-to`}>To</label>
          <input
            id={`${controlId}-to`}
            className={styles.input}
            type="date"
            name={toName}
            value={range.to ?? ''}
            min={range.from ?? min}
            max={max}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={message === undefined ? undefined : true}
            onChange={update('to')}
          />
        </div>
      </div>
      <FieldError id={errorId} error={message} />
    </fieldset>
  )
}
