import { cx } from '../classes'
import styles from './Badge.module.css'

export type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent'

export interface BadgeProps {
  readonly children: string
  readonly tone?: BadgeTone | undefined
  readonly className?: string | undefined
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, className)} data-tone={tone}>
      {children}
    </span>
  )
}
