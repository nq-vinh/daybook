import { cx } from '../classes'
import styles from './Skeleton.module.css'

export type SkeletonVariant = 'block' | 'text'

export interface SkeletonProps {
  readonly variant?: SkeletonVariant | undefined
  readonly lines?: number | undefined
  readonly className?: string | undefined
}

export function Skeleton({ variant = 'block', lines = 1, className }: SkeletonProps) {
  if (variant === 'block') {
    return <div className={cx(styles.skeleton, styles.block, className)} aria-hidden="true" data-skeleton="block" />
  }

  const count = Math.max(1, Math.floor(lines))

  return (
    <div className={cx(styles.text, className)} aria-hidden="true" data-skeleton="text">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={cx(styles.skeleton, styles.line)} />
      ))}
    </div>
  )
}
