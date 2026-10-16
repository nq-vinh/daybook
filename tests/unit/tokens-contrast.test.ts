// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8')

type Theme = 'light' | 'dark'

function token(name: string, theme: Theme): string {
  const match = new RegExp(String.raw`--color-${name}:\s*light-dark\((#[0-9a-f]{3,6}),\s*(#[0-9a-f]{3,6})\)`, 'i').exec(tokensCss)
  const value = theme === 'light' ? match?.[1] : match?.[2]

  if (value === undefined) {
    throw new Error(`tokens.css has no light-dark() value for --color-${name}.`)
  }

  return value
}

function channels(hex: string): number[] {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? digits.replace(/./g, '$&$&') : digits
  return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16) / 255)
}

function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = channels(hex).map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

const pairs = [
  { foreground: 'border-strong', background: 'surface', minimum: 3 },
  { foreground: 'border-strong', background: 'surface-sunken', minimum: 3 },
  { foreground: 'border-strong', background: 'surface-raised', minimum: 3 },
  { foreground: 'text', background: 'surface', minimum: 4.5 },
  { foreground: 'text', background: 'surface-raised', minimum: 4.5 },
  { foreground: 'text', background: 'surface-sunken', minimum: 4.5 },
  { foreground: 'text-muted', background: 'surface', minimum: 4.5 },
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
] as const

describe('token contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const { foreground, background, minimum } of pairs) {
      it(`${foreground} on ${background} reaches ${String(minimum)}:1 in ${theme}`, () => {
        expect(contrast(token(foreground, theme), token(background, theme))).toBeGreaterThanOrEqual(minimum)
      })
    }
  }
})
