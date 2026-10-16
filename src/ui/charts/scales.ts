export interface LinearScale {
  readonly domain: readonly [number, number]
  readonly range: readonly [number, number]
  (value: number): number
}

export interface NiceTicks {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly ticks: readonly number[]
}

export interface BandScale {
  readonly step: number
  readonly bandwidth: number
  start(index: number): number
  center(index: number): number
  index(position: number): number | null
}

const NICE_STEPS = [1, 2, 2.5, 5, 10] as const

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  const scale = (value: number): number => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))
  return Object.assign(scale, { domain, range })
}

function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / magnitude
  const nice = NICE_STEPS.find((candidate) => candidate >= fraction) ?? 10
  return nice * magnitude
}

export function niceTicks(min: number, max: number, count = 5): NiceTicks {
  const low = Math.min(min, max)
  const high = Math.max(min, max)

  if (low === high) {
    const pad = low === 0 ? 1 : Math.abs(low)
    return niceTicks(low - pad, high + pad, count)
  }

  let step = niceStep((high - low) / Math.max(1, count - 1))
  let niceMin = Math.floor(low / step) * step
  let niceMax = Math.ceil(high / step) * step

  while (Math.round((niceMax - niceMin) / step) + 1 > count) {
    step = niceStep(step * 1.01)
    niceMin = Math.floor(low / step) * step
    niceMax = Math.ceil(high / step) * step
  }

  const length = Math.round((niceMax - niceMin) / step) + 1
  const ticks = Array.from({ length }, (_, position) => {
    const tick = niceMin + position * step
    return Object.is(tick, -0) ? 0 : Number(tick.toPrecision(12))
  })

  return { min: ticks[0] ?? niceMin, max: ticks.at(-1) ?? niceMax, step, ticks }
}

export function bandScale(count: number, range: readonly [number, number], gap = 0): BandScale {
  const [r0, r1] = range
  const step = count === 0 ? 0 : (r1 - r0) / count
  const bandwidth = Math.max(0, step - gap)
  const offset = (step - bandwidth) / 2

  return {
    step,
    bandwidth,
    start: (index) => r0 + index * step + offset,
    center: (index) => r0 + index * step + step / 2,
    index: (position) => {
      if (step === 0 || position < r0 || position >= r1) {
        return null
      }
      return Math.min(count - 1, Math.floor((position - r0) / step))
    },
  }
}
