// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { composite, contrastBetween, contrastLevel, contrastRatio, formatRatio, parseColour, relativeLuminance } from './contrast'

describe('parseColour', () => {
  it('reads short and long hex with and without alpha', () => {
    expect(parseColour('#fff')).toEqual({ red: 255, green: 255, blue: 255, alpha: 1 })
    expect(parseColour('#1F5A3C')).toEqual({ red: 31, green: 90, blue: 60, alpha: 1 })
    expect(parseColour('#00000080')?.alpha).toBeCloseTo(0.502, 3)
  })

  it('reads legacy and modern rgb() and rgba() as getComputedStyle writes them', () => {
    expect(parseColour('rgb(23, 25, 23)')).toEqual({ red: 23, green: 25, blue: 23, alpha: 1 })
    expect(parseColour('rgba(21, 24, 26, 0.4)')).toEqual({ red: 21, green: 24, blue: 26, alpha: 0.4 })
    expect(parseColour('rgb(21 24 26 / 40%)')).toEqual({ red: 21, green: 24, blue: 26, alpha: 0.4 })
    expect(parseColour('rgb(100%, 0%, 50%)')).toEqual({ red: 255, green: 0, blue: 127.5, alpha: 1 })
  })

  it('reads color(srgb ...) with 0 to 1 channels', () => {
    expect(parseColour('color(srgb 1 0 0.5 / 0.25)')).toEqual({ red: 255, green: 0, blue: 127.5, alpha: 0.25 })
  })

  it('returns null for anything it cannot measure', () => {
    for (const value of ['', 'light-dark(#fff, #000)', 'var(--color-text)', 'oklch(0.5 0.1 120)', 'color(display-p3 1 0 0)', 'rgb(1, 2)', 'rgb(a, b, c)', 'rgb(1 2 3 / 0.5 / 1)', 'canvastext']) {
      expect(parseColour(value), value).toBeNull()
    }
  })
})

describe('contrast maths', () => {
  it('matches the WCAG 2.1 reference values', () => {
    expect(relativeLuminance({ red: 255, green: 255, blue: 255, alpha: 1 })).toBeCloseTo(1, 6)
    expect(contrastBetween('#000', '#fff')).toBeCloseTo(21, 6)
    expect(contrastBetween('#777', '#fff')).toBeCloseTo(4.48, 2)
    expect(contrastBetween('#fff', '#777')).toBe(contrastBetween('#777', '#fff'))
    expect(contrastBetween('#5b6166', 'rgb(91, 97, 102)')).toBe(1)
  })

  it('switches from the linear segment to the power curve at 0.04045', () => {
    const grey = (byte: number) => relativeLuminance({ red: byte, green: byte, blue: byte, alpha: 1 })

    expect(grey(10)).toBeCloseTo(10 / 255 / 12.92, 12)
    expect(grey(11)).toBeCloseTo(((11 / 255 + 0.055) / 1.055) ** 2.4, 12)
  })

  it('composites a translucent foreground over an opaque background', () => {
    expect(composite({ red: 0, green: 0, blue: 0, alpha: 0.5 }, { red: 255, green: 255, blue: 255, alpha: 1 })).toEqual({ red: 127.5, green: 127.5, blue: 127.5, alpha: 1 })
    expect(contrastBetween('rgba(0, 0, 0, 0)', '#fff')).toBeCloseTo(1, 6)
  })

  it('refuses to measure against a translucent background or unparsable input', () => {
    expect(contrastRatio({ red: 0, green: 0, blue: 0, alpha: 1 }, { red: 255, green: 255, blue: 255, alpha: 0.5 })).toBeNull()
    expect(contrastBetween('light-dark(#000, #fff)', '#fff')).toBeNull()
  })

  it('names the WCAG level and fails anything below the minimum of its pair', () => {
    expect(contrastLevel(7, 'text', 4.5)).toBe('AAA')
    expect(contrastLevel(6.99, 'text', 4.5)).toBe('AA')
    expect(contrastLevel(4.5, 'text', 4.5)).toBe('AA')
    expect(contrastLevel(4.49, 'text', 4.5)).toBe('Fails')
    expect(contrastLevel(4.49, 'text', 3)).toBe('AA large')
    expect(contrastLevel(2.99, 'text', 3)).toBe('Fails')
    expect(contrastLevel(3, 'non-text', 3)).toBe('AA')
    expect(contrastLevel(2.99, 'non-text', 3)).toBe('Fails')
  })

  it('derives the level from the same truncated value it displays', () => {
    for (const ratio of [4.4999, 4.499999999999, 4.5, 6.9999, 2.9999]) {
      const shown = Number(formatRatio(ratio))
      expect(contrastLevel(ratio, 'text', 4.5), String(ratio)).toBe(contrastLevel(shown, 'text', 4.5))
      expect(contrastLevel(ratio, 'non-text', 3), String(ratio)).toBe(contrastLevel(shown, 'non-text', 3))
    }
  })

  it('formats by truncating so the shown ratio never overstates the measurement', () => {
    expect(formatRatio(4.4999)).toBe('4.49')
    expect(formatRatio(4.5)).toBe('4.50')
    expect(formatRatio(21)).toBe('21.00')
    expect(formatRatio(4.35)).toBe('4.35')
  })
})
