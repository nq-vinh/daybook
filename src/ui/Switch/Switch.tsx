import type { ComponentPropsWithRef } from 'react'

import { cx } from '../classes'
import styles from './Switch.module.css'

export interface SwitchProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'role' | 'aria-checked' | 'children'> {
  readonly label: string
}

export function Switch({ label, className, ...rest }: SwitchProps) {
  return (
    <label className={cx(styles.root, className)}>
      <span className={styles.control}>
        <input {...rest} type="checkbox" role="switch" className={styles.input} />
        <span className={styles.track} data-focus-ring="" aria-hidden="true">
          <span className={styles.thumb} />
        </span>
      </span>
      <span>{label}</span>
    </label>
  )
}
