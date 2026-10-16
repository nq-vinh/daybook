import { useId } from 'react'

import { cx } from '../classes'
import styles from './Icon.module.css'

const paths = {
  'chevron-down': ['M6 9l6 6 6-6'],
  check: ['M20 6 9 17l-5-5'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z',
    'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
  ],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  monitor: ['M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 21h8M12 17v4'],
  spinner: ['M21 12a9 9 0 1 1-6.22-8.56'],
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof paths

export interface IconProps {
  readonly name: IconName
  readonly size?: 16 | 20 | undefined
  readonly label?: string | undefined
  readonly className?: string | undefined
}

export function Icon({ name, size = 16, label, className }: IconProps) {
  const titleId = useId()

  return (
    <svg
      className={cx(styles.icon, name === 'spinner' && styles.spin, className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={label === undefined ? undefined : 'img'}
      aria-hidden={label === undefined ? true : undefined}
      aria-labelledby={label === undefined ? undefined : titleId}
    >
      {label !== undefined && <title id={titleId}>{label}</title>}
      {paths[name].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}
