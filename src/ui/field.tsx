import { useId, type ReactNode } from 'react'

import { cx } from './classes'
import styles from './field.module.css'

export { styles as fieldStyles }

export interface FieldIds {
  readonly controlId: string
  readonly descriptionId: string | undefined
  readonly errorId: string | undefined
  readonly describedBy: string | undefined
}

export function useFieldIds(
  id: string | undefined,
  description: string | undefined,
  error: string | undefined,
): FieldIds {
  const generated = useId()
  const controlId = id ?? generated
  const descriptionId = description === undefined ? undefined : `${controlId}-description`
  const errorId = error === undefined ? undefined : `${controlId}-error`
  const describedBy = [descriptionId, errorId].filter((part) => part !== undefined).join(' ')

  return { controlId, descriptionId, errorId, describedBy: describedBy === '' ? undefined : describedBy }
}

export function joinMessages(...messages: readonly (string | undefined)[]): string | undefined {
  const present = messages.filter((message) => message !== undefined && message !== '')
  return present.length === 0 ? undefined : present.join(' ')
}

interface FieldErrorProps {
  readonly id: string | undefined
  readonly error: string | undefined
}

export function FieldError({ id, error }: FieldErrorProps) {
  return (
    <div aria-live="polite">
      {error !== undefined && <p id={id} className={styles.error}>{error}</p>}
    </div>
  )
}

interface FieldProps {
  readonly ids: FieldIds
  readonly label: string
  readonly description: string | undefined
  readonly error: string | undefined
  readonly className: string | undefined
  readonly children: ReactNode
}

export function Field({ ids, label, description, error, className, children }: FieldProps) {
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={ids.controlId}>{label}</label>
      {description !== undefined && <p id={ids.descriptionId} className={styles.description}>{description}</p>}
      {children}
      <FieldError id={ids.errorId} error={error} />
    </div>
  )
}
