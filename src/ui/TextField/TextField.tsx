import type { ComponentPropsWithRef, ReactNode } from 'react'

import { Field, fieldStyles, useFieldIds } from '../field'
import styles from './TextField.module.css'

export interface TextFieldProps
  extends Omit<ComponentPropsWithRef<'input'>, 'prefix' | 'children' | 'aria-describedby' | 'aria-invalid'> {
  readonly label: ReactNode
  readonly description?: string | undefined
  readonly error?: string | undefined
  readonly prefix?: ReactNode
  readonly suffix?: ReactNode
  readonly align?: 'start' | 'end' | undefined
  readonly multiline?: undefined
}

export interface MultilineTextFieldProps
  extends Omit<ComponentPropsWithRef<'textarea'>, 'children' | 'aria-describedby' | 'aria-invalid'> {
  readonly label: ReactNode
  readonly description?: string | undefined
  readonly error?: string | undefined
  readonly multiline: true
}

export function TextField(props: TextFieldProps | MultilineTextFieldProps) {
  const ids = useFieldIds(props.id, props.description, props.error)

  if (props.multiline === true) {
    const { label, description, error, multiline, className, rows = 4, ref, ...rest } = props

    return (
      <Field ids={ids} label={label} description={description} error={error} className={className}>
        <div className={fieldStyles.control} data-multiline={multiline} data-focus-within-ring="">
          <textarea
            {...rest}
            ref={ref}
            id={ids.controlId}
            rows={rows}
            className={styles.textarea}
            data-ring-source=""
            aria-describedby={ids.describedBy}
            aria-invalid={error === undefined ? undefined : true}
          />
        </div>
      </Field>
    )
  }

  const {
    label,
    description,
    error,
    prefix,
    suffix,
    align = 'start',
    className,
    type = 'text',
    ref,
    ...rest
  } = props

  return (
    <Field ids={ids} label={label} description={description} error={error} className={className}>
      <div className={fieldStyles.control} data-focus-within-ring="">
        {prefix !== undefined && <span className={fieldStyles.affix}>{prefix}</span>}
        <input
          {...rest}
          ref={ref}
          id={ids.controlId}
          type={type}
          className={styles.input}
          data-align={align}
          data-ring-source=""
          aria-describedby={ids.describedBy}
          aria-invalid={error === undefined ? undefined : true}
        />
        {suffix !== undefined && <span className={fieldStyles.affix}>{suffix}</span>}
      </div>
    </Field>
  )
}
