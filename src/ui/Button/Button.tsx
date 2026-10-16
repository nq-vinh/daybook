import type { ComponentPropsWithRef, MouseEvent } from 'react'

import { cx } from '../classes'
import { Icon } from '../Icon/Icon'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  readonly variant?: ButtonVariant | undefined
  readonly size?: ButtonSize | undefined
  readonly loading?: boolean | undefined
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  type = 'button',
  disabled,
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault()
      return
    }

    onClick?.(event)
  }

  return (
    <button
      {...rest}
      type={type}
      className={cx(styles.button, styles[variant], size === 'sm' && styles.sm, className)}
      disabled={loading ? undefined : disabled}
      aria-disabled={loading ? true : rest['aria-disabled']}
      aria-busy={loading ? true : undefined}
      onClick={handleClick}
    >
      <span className={styles.content}>{children}</span>
      {loading && <Icon name="spinner" className={styles.spinner} />}
    </button>
  )
}
