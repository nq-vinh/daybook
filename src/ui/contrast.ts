export interface Rgba {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

export type ContrastKind = 'text' | 'non-text'

export type ContrastLevel = 'AAA' | 'AA' | 'AA large' | 'Fails'

const HEX_COLOUR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTIONAL_COLOUR = /^(rgba?|color)\((.*)\)$/i

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseHex(digits: string): Rgba {
  const full = digits.length <= 4 ? digits.replace(/./g, '$&$&') : digits
  const [red = 0, green = 0, blue = 0, alpha = 255] = [0, 2, 4, 6]
    .map((start) => full.slice(start, start + 2))
    .filter((pair) => pair !== '')
    .map((pair) => Number.parseInt(pair, 16))

  return { red, green, blue, alpha: alpha / 255 }
}

function parseComponent(token: string, scale: number): number | null {
  const isPercentage = token.endsWith('%')
  const text = isPercentage ? token.slice(0, -1) : token
  const value = text === '' ? Number.NaN : Number(text)

  if (!Number.isFinite(value)) {
    return null
  }

  return isPercentage ? (value / 100) * scale : value
}

export function parseColour(value: string): Rgba | null {
  const text = value.trim().toLowerCase()
  const hex = HEX_COLOUR.exec(text)

  if (hex?.[1] !== undefined) {
    return parseHex(hex[1])
  }

  const functional = FUNCTIONAL_COLOUR.exec(text)

  if (functional === null) {
    return null
  }

  const [, name = '', body = ''] = functional
  const [channelText = '', alphaText, ...rest] = body.split('/')

  if (rest.length > 0) {
    return null
  }

  let channels = channelText.split(/[\s,]+/).filter((token) => token !== '')
  let alphaToken = alphaText?.trim()
  const isColourFunction = name === 'color'

  if (isColourFunction) {
    if (channels[0] !== 'srgb') {
      return null
    }
    channels = channels.slice(1)
  }

  if (alphaToken === undefined && channels.length === 4) {
    alphaToken = channels[3]
    channels = channels.slice(0, 3)
  }

  if (channels.length !== 3) {
    return null
  }

  const channelScale = isColourFunction ? 1 : 255
  const [red, green, blue] = channels.map((token) => parseComponent(token, channelScale))
  const alpha = alphaToken === undefined ? 1 : parseComponent(alphaToken, 1)

  if (red == null || green == null || blue == null || alpha === null) {
    return null
  }

  const toByte = (channel: number) => clamp(isColourFunction ? channel * 255 : channel, 0, 255)

  return { red: toByte(red), green: toByte(green), blue: toByte(blue), alpha: clamp(alpha, 0, 1) }
}

function linearise(channel: number): number {
  const ratio = channel / 255
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance({ red, green, blue }: Rgba): number {
  return 0.2126 * linearise(red) + 0.7152 * linearise(green) + 0.0722 * linearise(blue)
}

export function composite(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha)

  if (alpha === 0) {
    return { red: 0, green: 0, blue: 0, alpha: 0 }
  }

  const mix = (upper: number, lower: number) => (upper * top.alpha + lower * bottom.alpha * (1 - top.alpha)) / alpha

  return { red: mix(top.red, bottom.red), green: mix(top.green, bottom.green), blue: mix(top.blue, bottom.blue), alpha }
}

export function contrastRatio(foreground: Rgba, background: Rgba): number | null {
  if (background.alpha < 1) {
    return null
  }

  const visible = foreground.alpha < 1 ? composite(foreground, background) : foreground
  const [lighter, darker] = [relativeLuminance(visible), relativeLuminance(background)].sort((a, b) => b - a)

  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

export function contrastBetween(foreground: string, background: string): number | null {
  const parsedForeground = parseColour(foreground)
  const parsedBackground = parseColour(background)

  return parsedForeground === null || parsedBackground === null ? null : contrastRatio(parsedForeground, parsedBackground)
}

export function truncateRatio(ratio: number): number {
  return Math.floor(ratio * 100 + 1e-9) / 100
}

export function contrastLevel(ratio: number, kind: ContrastKind, minimum: number): ContrastLevel {
  const shown = truncateRatio(ratio)

  if (shown < minimum || shown < 3) {
    return 'Fails'
  }

  if (kind === 'non-text') {
    return 'AA'
  }

  if (shown >= 7) {
    return 'AAA'
  }

  return shown >= 4.5 ? 'AA' : 'AA large'
}

export function formatRatio(ratio: number): string {
  return truncateRatio(ratio).toFixed(2)
}
