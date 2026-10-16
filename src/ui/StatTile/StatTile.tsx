import { useId, type ReactNode } from 'react'

import { cx } from '../classes'
import { Icon } from '../Icon/Icon'
import styles from './StatTile.module.css'

export type StatTrend = 'up' | 'down' | 'flat'
export type StatTone = 'positive' | 'negative' | 'neutral'

export interface StatDelta {
  readonly value: string
  readonly label: string
  readonly trend: StatTrend
  readonly tone?: StatTone | undefined
}

export interface StatTileProps {
  readonly label: string
  readonly value: string
  readonly delta?: StatDelta | undefined
  readonly children?: ReactNode
  readonly className?: string | undefined
}

export function StatTile({ label, value, delta, children, className }: StatTileProps) {
  const labelId = useId()

  return (
    <div className={cx(styles.tile, className)} role="group" aria-labelledby={labelId}>
      <p id={labelId} className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      {delta !== undefined && (
        <p className={styles.delta} data-tone={delta.tone ?? 'neutral'}>
          {delta.trend !== 'flat' && <Icon name={delta.trend === 'up' ? 'arrow-up' : 'arrow-down'} />}
          <span>{`${delta.value} ${delta.label}`}</span>
        </p>
      )}
      {children}
    </div>
  )
}
