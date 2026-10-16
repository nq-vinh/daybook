import { useLayoutEffect, useRef, type ComponentPropsWithRef } from 'react'

import { cx } from '../classes'
import { Icon } from '../Icon/Icon'
import { mergeRefs } from '../refs'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'children'> {
  readonly label: string
  readonly indeterminate?: boolean | undefined
}

export function Checkbox({ label, indeterminate = false, className, ref, ...rest }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.indeterminate = indeterminate
    }
  })

  return (
    <label className={cx(styles.root, className)}>
      <span className={styles.control}>
        <input
          {...rest}
          ref={mergeRefs(inputRef, ref)}
          type="checkbox"
          className={styles.input}
        />
        <span className={styles.box} data-focus-ring="" aria-hidden="true">
          <Icon name="check" className={styles.check} />
        </span>
      </span>
      <span>{label}</span>
    </label>
  )
}
