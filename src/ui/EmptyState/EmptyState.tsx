import type { ReactNode } from 'react'

import { cx } from '../classes'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  readonly title: string
  readonly description: string
  readonly headingLevel?: 2 | 3 | undefined
  readonly action?: ReactNode
  readonly className?: string | undefined
}

export function EmptyState({ title, description, headingLevel = 2, action, className }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <div className={cx(styles.root, className)}>
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.description}>{description}</p>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  )
}
