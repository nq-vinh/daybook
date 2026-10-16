import { useId } from 'react'

import { setThemePreference, useThemePreference, type ThemePreference } from '../../state/theme'
import { cx } from '../classes'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './ThemeSwitch.module.css'

const options = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
] as const satisfies readonly { value: ThemePreference; label: string; icon: IconName }[]

export interface ThemeSwitchProps {
  readonly className?: string | undefined
}

export function ThemeSwitch({ className }: ThemeSwitchProps) {
  const preference = useThemePreference()
  const name = useId()

  return (
    <div className={cx(styles.group, className)} role="radiogroup" aria-label="Theme">
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option.value}
            checked={preference === option.value}
            onChange={() => {
              setThemePreference(option.value)
            }}
          />
          <span className={styles.segment} data-focus-ring="">
            <Icon name={option.icon} />
            {option.label}
          </span>
        </label>
      ))}
    </div>
  )
}
