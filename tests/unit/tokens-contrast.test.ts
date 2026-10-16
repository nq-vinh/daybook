// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { contrastBetween } from '../../src/ui/contrast'

const tokensCss = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8')

type Theme = 'light' | 'dark'

function token(name: string, theme: Theme): string {
  const property = name.startsWith('avatar-') ? `--${name}` : `--color-${name}`
  const match = new RegExp(String.raw`${property}:\s*light-dark\((#[0-9a-f]{3,6}),\s*(#[0-9a-f]{3,6})\)`, 'i').exec(tokensCss)
  const value = theme === 'light' ? match?.[1] : match?.[2]

  if (value === undefined) {
    throw new Error(`tokens.css has no light-dark() value for ${property}.`)
  }

  return value
}

function contrast(foreground: string, background: string): number {
  const ratio = contrastBetween(foreground, background)

  if (ratio === null) {
    throw new Error(`Cannot measure ${foreground} on ${background}.`)
  }

  return ratio
}

const pairs = [
  { foreground: 'border-strong', background: 'surface', minimum: 3 },
  { foreground: 'border-strong', background: 'surface-sunken', minimum: 3 },
  { foreground: 'border-strong', background: 'surface-raised', minimum: 3 },
  { foreground: 'text', background: 'surface', minimum: 4.5 },
  { foreground: 'text', background: 'surface-raised', minimum: 4.5 },
  { foreground: 'text', background: 'surface-sunken', minimum: 4.5 },
  { foreground: 'text-muted', background: 'surface', minimum: 4.5 },
  { foreground: 'text-muted', background: 'surface-sunken', minimum: 4.5 },
  { foreground: 'accent-contrast', background: 'accent', minimum: 4.5 },
  { foreground: 'accent-contrast', background: 'accent-hover', minimum: 4.5 },
  { foreground: 'negative-contrast', background: 'negative', minimum: 4.5 },
  { foreground: 'negative-contrast', background: 'negative-hover', minimum: 4.5 },
  { foreground: 'positive', background: 'surface', minimum: 4.5 },
  { foreground: 'negative', background: 'surface', minimum: 4.5 },
  { foreground: 'warning', background: 'surface', minimum: 4.5 },
  { foreground: 'accent', background: 'surface', minimum: 4.5 },
  { foreground: 'warning-text', background: 'surface', minimum: 4.5 },
  { foreground: 'text-muted', background: 'badge-neutral', minimum: 4.5 },
  { foreground: 'positive', background: 'badge-positive', minimum: 4.5 },
  { foreground: 'negative', background: 'badge-negative', minimum: 4.5 },
  { foreground: 'warning-text', background: 'badge-warning', minimum: 4.5 },
  { foreground: 'accent', background: 'badge-accent', minimum: 4.5 },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((hue) => ({ foreground: 'text', background: `avatar-${String(hue)}`, minimum: 4.5 })),
]

describe('token contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const { foreground, background, minimum } of pairs) {
      it(`${foreground} on ${background} reaches ${String(minimum)}:1 in ${theme}`, () => {
        expect(contrast(token(foreground, theme), token(background, theme))).toBeGreaterThanOrEqual(minimum)
      })
    }
  }
})
