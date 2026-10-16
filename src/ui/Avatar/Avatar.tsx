import { hashCombine } from '../../domain/prng'
import { cx } from '../classes'
import styles from './Avatar.module.css'

const AVATAR_HUES = 8
const AVATAR_SEED = 0x61766174

export type AvatarSize = 'sm' | 'md'

export interface AvatarProps {
  readonly id: string
  readonly name: string
  readonly size?: AvatarSize | undefined
  readonly decorative?: boolean | undefined
  readonly className?: string | undefined
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase('en')
}

export function avatarHue(id: string): number {
  const codePoints = Array.from(id, (character) => character.codePointAt(0) ?? 0)
  return (hashCombine(AVATAR_SEED, ...codePoints) % AVATAR_HUES) + 1
}

export function Avatar({ id, name, size = 'md', decorative = false, className }: AvatarProps) {
  return (
    <span
      className={cx(styles.avatar, size === 'sm' && styles.sm, className)}
      data-hue={avatarHue(id)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  )
}
