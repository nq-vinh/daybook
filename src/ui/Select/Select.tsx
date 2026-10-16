import type { ComponentPropsWithRef } from 'react'

import { Field, useFieldIds } from '../field'
import { Icon } from '../Icon/Icon'
import styles from './Select.module.css'

export interface SelectProps extends Omit<ComponentPropsWithRef<'select'>, 'aria-describedby' | 'aria-invalid'> {
  readonly label: string
  readonly description?: string | undefined
  readonly error?: string | undefined
}

export function Select({ label, description, error, id, className, children, ref, ...rest }: SelectProps) {
  const ids = useFieldIds(id, description, error)

  return (
    <Field ids={ids} label={label} description={description} error={error} className={className}>
      <div className={styles.control}>
        <select
          {...rest}
          ref={ref}
          id={ids.controlId}
          className={styles.select}
          aria-describedby={ids.describedBy}
          aria-invalid={error === undefined ? undefined : true}
        >
          {children}
        </select>
        <Icon name="chevron-down" className={styles.chevron} />
      </div>
    </Field>
  )
}
