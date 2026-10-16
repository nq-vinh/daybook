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
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  monitor: ['M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 21h8M12 17v4'],
  spinner: ['M21 12a9 9 0 1 1-6.22-8.56'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  'more-horizontal': [
    'M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z',
    'M19 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z',
    'M5 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z',
  ],
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'M12 16v-4', 'M12 8h.01'],
  'check-circle': ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  alert: [
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    'M12 9v4',
    'M12 17h.01',
  ],
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
