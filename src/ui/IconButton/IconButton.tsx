import type { ReactElement } from 'react'

import { Button, type ButtonProps } from '../Button/Button'
import { cx } from '../classes'
import styles from './IconButton.module.css'

export interface IconButtonProps extends Omit<ButtonProps, 'aria-label' | 'aria-pressed' | 'children'> {
  readonly label: string
  readonly children: ReactElement
  readonly pressed?: boolean | undefined
}

export function IconButton({ label, pressed, size = 'md', variant = 'quiet', className, ...rest }: IconButtonProps) {
  return (
    <Button
      {...rest}
      size={size}
      variant={variant}
      className={cx(styles.iconButton, styles[size], className)}
      aria-label={label}
      aria-pressed={pressed}
    />
  )
}
