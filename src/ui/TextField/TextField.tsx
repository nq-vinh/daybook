import type { ComponentPropsWithRef, ReactNode } from 'react'

import { Field, fieldStyles, useFieldIds } from '../field'
import styles from './TextField.module.css'

export interface TextFieldProps
  extends Omit<ComponentPropsWithRef<'input'>, 'prefix' | 'children' | 'aria-describedby' | 'aria-invalid'> {
  readonly label: string
  readonly description?: string | undefined
  readonly error?: string | undefined
  readonly prefix?: ReactNode
  readonly suffix?: ReactNode
  readonly align?: 'start' | 'end' | undefined
}

export function TextField({
  label,
  description,
  error,
  prefix,
  suffix,
  align = 'start',
  id,
  className,
  type = 'text',
  ref,
  ...rest
}: TextFieldProps) {
  const ids = useFieldIds(id, description, error)

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
