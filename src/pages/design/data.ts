import type { ContrastKind } from '../../ui/contrast'

export interface ColourToken {
  readonly name: string
  readonly use: string
}

export interface ContrastPair {
  readonly foreground: string
  readonly background: string
  readonly kind: ContrastKind
  readonly minimum: number
}

export interface MeasuredToken {
  readonly name: string
  readonly note?: string | undefined
}

export const colourTokens: readonly ColourToken[] = [
  { name: '--color-surface', use: 'Page paper' },
  { name: '--color-surface-raised', use: 'Popovers, dialogs, toasts and the feed card' },
  { name: '--color-surface-sunken', use: 'Input wells, table header and selected rows' },
  { name: '--color-text', use: 'Ink' },
  { name: '--color-text-muted', use: 'Secondary labels and ledger dates' },
  { name: '--color-accent', use: 'Actions, links and selection' },
  { name: '--color-accent-hover', use: 'Hover and active on accent surfaces' },
  { name: '--color-accent-contrast', use: 'Text on accent' },
  { name: '--color-positive', use: 'Credits and confirmations' },
  { name: '--color-negative', use: 'Debits, declined and destructive actions' },
  { name: '--color-negative-hover', use: 'Hover and active on danger surfaces' },
  { name: '--color-negative-contrast', use: 'Text on negative' },
  { name: '--color-warning', use: 'Pending and budgets past 80 %' },
  { name: '--color-warning-text', use: 'Warning badge text' },
  { name: '--color-border', use: 'Hairline rules, decorative' },
  { name: '--color-border-strong', use: 'Input borders and the table header rule' },
  { name: '--color-focus', use: 'Focus ring, the same as accent' },
  { name: '--color-badge-neutral', use: 'Neutral badge surface' },
  { name: '--color-badge-positive', use: 'Positive badge surface' },
  { name: '--color-badge-negative', use: 'Negative badge surface' },
  { name: '--color-badge-warning', use: 'Warning badge surface' },
  { name: '--color-badge-accent', use: 'Accent badge surface' },
  { name: '--color-backdrop', use: 'Dialog backdrop, translucent' },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((hue) => ({ name: `--avatar-${String(hue)}`, use: `Avatar hue ${String(hue)}` })),
]

const text = (foreground: string, background: string): ContrastPair => ({ foreground, background, kind: 'text', minimum: 4.5 })
const nonText = (foreground: string, background: string): ContrastPair => ({ foreground, background, kind: 'non-text', minimum: 3 })

export const contrastPairs: readonly ContrastPair[] = [
  text('--color-text', '--color-surface'),
  text('--color-text-muted', '--color-surface'),
  text('--color-text-muted', '--color-surface-sunken'),
  text('--color-text', '--color-surface-raised'),
  text('--color-text', '--color-surface-sunken'),
  text('--color-accent', '--color-surface'),
  text('--color-positive', '--color-surface'),
  text('--color-negative', '--color-surface'),
  text('--color-warning', '--color-surface'),
  text('--color-warning-text', '--color-surface'),
  text('--color-accent-contrast', '--color-accent'),
  text('--color-accent-contrast', '--color-accent-hover'),
  text('--color-negative-contrast', '--color-negative'),
  text('--color-negative-contrast', '--color-negative-hover'),
  text('--color-text-muted', '--color-badge-neutral'),
  text('--color-positive', '--color-badge-positive'),
  text('--color-negative', '--color-badge-negative'),
  text('--color-warning-text', '--color-badge-warning'),
  text('--color-accent', '--color-badge-accent'),
  nonText('--color-border-strong', '--color-surface'),
  nonText('--color-border-strong', '--color-surface-sunken'),
  nonText('--color-border-strong', '--color-surface-raised'),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((hue) => text('--color-text', `--avatar-${String(hue)}`)),
]

export const textTokens: readonly MeasuredToken[] = [
  { name: '--text-xs' },
  { name: '--text-sm' },
  { name: '--text-md', note: 'Body' },
  { name: '--text-lg', note: 'h4' },
  { name: '--text-xl', note: 'h3' },
  { name: '--text-2xl', note: 'h2' },
  { name: '--text-3xl', note: 'h1' },
]

export const spaceTokens: readonly MeasuredToken[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16].map((step) => ({ name: `--space-${String(step)}` }))

export const radiusTokens: readonly MeasuredToken[] = [
  { name: '--radius-sm', note: 'Controls' },
  { name: '--radius-md', note: 'Floating layers' },
  { name: '--radius-full', note: 'Avatars and badges' },
]

export const durationTokens: readonly MeasuredToken[] = [
  { name: '--duration-fast', note: 'Hover, focus and the route cross-fade' },
  { name: '--duration-base', note: 'Popovers, toasts and feed rows' },
  { name: '--duration-spin', note: 'One turn of the loading spinner' },
  { name: '--duration-shimmer', note: 'One pass of the skeleton shimmer' },
  { name: '--delay-tooltip', note: 'Wait before a tooltip fades in' },
]

export const layerTokens: readonly MeasuredToken[] = [
  { name: '--z-sticky', note: 'Sticky table header' },
  { name: '--z-toast', note: 'Toast region and the skip link' },
]
