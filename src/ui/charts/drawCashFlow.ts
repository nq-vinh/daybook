import { formatCompactMoney } from '../../domain/format'
import type { Currency } from '../../domain/world'
import { axisLabel, type CashFlowMonth } from './months'
import { type BandScale, bandScale, type LinearScale, linearScale, niceTicks } from './scales'
import type { CanvasFrame } from './useCanvas'

export interface CashFlowGeometry {
  readonly band: BandScale
  readonly y: LinearScale
  readonly top: number
  readonly bottom: number
}

const BAR_GAP = 2
const BAR_RADIUS = 4
const TICK_COUNT = 5
const AXIS_GAP = 8

function crisp(value: number, dpr: number): number {
  return (Math.round(value * dpr) + (Math.round(dpr) % 2) / 2) / dpr
}

export function drawCashFlow(
  frame: CanvasFrame,
  months: readonly CashFlowMonth[],
  currency: Currency,
  locale: string,
): CashFlowGeometry {
  const { context, width, height, dpr } = frame
  const fontSize = frame.fontSize('--text-xs')
  const lineHeight = Math.round(fontSize * 1.4)
  const colours = {
    positive: frame.colour('--color-positive'),
    negative: frame.colour('--color-negative'),
    text: frame.colour('--color-text-muted'),
    grid: frame.colour('--color-border'),
    baseline: frame.colour('--color-border-strong'),
    band: frame.colour('--color-surface-sunken'),
  }

  context.font = frame.font('--text-xs')
  context.textBaseline = 'middle'

  const nets = months.map((month) => month.net)
  const ticks = niceTicks(Math.min(0, ...nets), Math.max(0, ...nets), TICK_COUNT)
  const tickLabels = ticks.ticks.map((tick) => formatCompactMoney(tick, currency, locale))
  const axisWidth = Math.ceil(Math.max(0, ...tickLabels.map((label) => context.measureText(label).width))) + AXIS_GAP
  const top = lineHeight + AXIS_GAP / 2
  const bottom = Math.max(top + 1, height - lineHeight * 2 - AXIS_GAP / 2)
  const y = linearScale([ticks.min, ticks.max], [bottom, top])
  const band = bandScale(months.length, [axisWidth, width], BAR_GAP)
  const zero = y(0)

  const firstForecast = months.findIndex((month) => month.kind === 'forecast')
  if (firstForecast >= 0) {
    const bandStart = axisWidth + firstForecast * band.step
    context.fillStyle = colours.band
    context.fillRect(bandStart, 0, width - bandStart, bottom)
    context.fillStyle = colours.text
    context.textAlign = 'end'
    context.fillText('Forecast', width - AXIS_GAP / 2, lineHeight / 2 + AXIS_GAP / 4)
  }

  context.lineWidth = 1
  ticks.ticks.forEach((tick, position) => {
    const line = crisp(y(tick), dpr)
    if (tick !== 0) {
      context.strokeStyle = colours.grid
      context.beginPath()
      context.moveTo(axisWidth, line)
      context.lineTo(width, line)
      context.stroke()
    }
    context.fillStyle = colours.text
    context.textAlign = 'end'
    context.fillText(tickLabels[position] ?? '', axisWidth - AXIS_GAP, line)
  })

  const tokens = { positive: '--color-positive', negative: '--color-negative' } as const
  months.forEach((month, index) => {
    const polarity = month.net >= 0 ? 'positive' : 'negative'
    const end = y(month.net)
    const barTop = Math.min(end, zero)
    const barHeight = Math.abs(end - zero)
    if (barHeight === 0) {
      return
    }
    const radius = Math.min(BAR_RADIUS, barHeight, band.bandwidth / 2)
    context.fillStyle = month.kind === 'forecast' ? frame.hatch(tokens[polarity]) : colours[polarity]
    context.beginPath()
    context.roundRect(band.start(index), barTop, band.bandwidth, barHeight, polarity === 'positive' ? [radius, radius, 0, 0] : [0, 0, radius, radius])
    context.fill()
  })

  const baseline = crisp(zero, dpr)
  context.strokeStyle = colours.baseline
  context.beginPath()
  context.moveTo(axisWidth, baseline)
  context.lineTo(width, baseline)
  context.stroke()

  const labels = months.map((month, index) => axisLabel(month, locale, index === 0))
  const widest = Math.max(0, ...labels.flatMap(([first, second]) => [first, second ?? ''].map((text) => context.measureText(text).width)))
  const every = Math.max(1, Math.ceil((widest + AXIS_GAP) / Math.max(1, band.step)))
  const anchorIndex = Math.max(0, months.findIndex((month) => month.kind === 'current'))
  context.fillStyle = colours.text
  context.textAlign = 'center'
  labels.forEach(([first, second], index) => {
    if (index !== 0 && (index < every || Math.abs(index - anchorIndex) % every !== 0)) {
      return
    }
    const x = band.center(index)
    context.fillText(first, x, bottom + AXIS_GAP / 2 + lineHeight / 2)
    if (second !== null) {
      context.fillText(second, x, bottom + AXIS_GAP / 2 + lineHeight * 1.5)
    }
  })

  return { band, y, top, bottom }
}
