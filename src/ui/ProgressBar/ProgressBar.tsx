import { useId } from 'react'

import { cx } from '../classes'
import styles from './ProgressBar.module.css'

export type ProgressState = 'normal' | 'warning' | 'over'

export interface ProgressBarProps {
  readonly label: string
  readonly value: number
  readonly valueText: string
  readonly min?: number | undefined
  readonly max?: number | undefined
  readonly low?: number | undefined
  readonly high?: number | undefined
  readonly optimum?: number | undefined
  readonly className?: string | undefined
}

export function progressState(value: number, min: number, max: number, high: number | undefined): ProgressState {
  if (value >= max) {
    return 'over'
  }

  return value >= (high ?? min + (max - min) * 0.8) ? 'warning' : 'normal'
}

export function ProgressBar({ label, value, valueText, min = 0, max = 1, low, high, optimum, className }: ProgressBarProps) {
  const id = useId()
  const state = progressState(value, min, max, high)

  return (
    <div className={cx(styles.root, className)} data-state={state}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor={id}>{label}</label>
        <span className={styles.value}>{valueText}</span>
      </div>
      <meter
        id={id}
        className={styles.meter}
        min={min}
        max={max}
        value={value}
        low={low}
        high={high}
        optimum={optimum}
        aria-valuetext={valueText}
      />
    </div>
  )
}
