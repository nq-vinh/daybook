import type { ReactNode } from 'react'

import { cx } from '../classes'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  readonly title: string
  readonly description: string
  readonly headingLevel?: 2 | 3 | 4 | undefined
  readonly action?: ReactNode
  readonly compact?: boolean | undefined
  readonly className?: string | undefined
}

export function EmptyState({ title, description, headingLevel = 2, action, compact = false, className }: EmptyStateProps) {
  const Heading = (['h2', 'h3', 'h4'] as const)[headingLevel - 2] ?? 'h2'

  return (
    <div className={cx(styles.root, compact && styles.compact, className)}>
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.description}>{description}</p>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  )
}
