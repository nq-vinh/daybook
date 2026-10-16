import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDrawRateMeter } from '../ui/charts/drawRate'
import { getHudMetrics, getHudVisible, observeHud, recordDrawRate, resetHudForTest, setHudVisible, subscribeHudMetrics } from './hud'

interface FakeEntry {
  readonly duration: number
  readonly startTime?: number
  readonly interactionId?: number
}

class FakeObserver {
  static readonly supportedEntryTypes = ['event', 'longtask']
  static readonly instances: FakeObserver[] = []
  readonly callback: (list: { getEntries(): FakeEntry[] }) => void
  options: PerformanceObserverInit | null = null
  disconnected = false

  constructor(callback: (list: { getEntries(): FakeEntry[] }) => void) {
    this.callback = callback
    FakeObserver.instances.push(this)
  }

  observe(options: PerformanceObserverInit): void {
    this.options = options
  }

  disconnect(): void {
    this.disconnected = true
  }

  emit(entries: FakeEntry[]): void {
    this.callback({ getEntries: () => entries })
  }
}

function observerFor(type: string): FakeObserver {
  const found = FakeObserver.instances.find((instance) => instance.options?.type === type)
  if (found === undefined) {
    throw new Error(`No ${type} observer`)
  }
  return found
}

describe('hud store', () => {
  beforeEach(() => {
    FakeObserver.instances.length = 0
    vi.stubGlobal('PerformanceObserver', FakeObserver)
    vi.spyOn(performance, 'now').mockReturnValue(0)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetHudForTest()
    window.localStorage.clear()
  })

  it('keeps the worst interaction over the 16 ms threshold and ignores non-interaction events', () => {
    const stop = observeHud()
    const events = observerFor('event')

    expect(events.options).toEqual({ type: 'event', buffered: true, durationThreshold: 16 })

    events.emit([{ duration: 24, interactionId: 3 }, { duration: 80, interactionId: 0 }])
    events.emit([{ duration: 40, interactionId: 4 }, { duration: 32, interactionId: 5 }])

    expect(getHudMetrics().worstInteraction).toBe(40)
    stop()
  })

  it('counts long tasks and their total duration', () => {
    const stop = observeHud()

    observerFor('longtask').emit([{ duration: 60, startTime: 100 }, { duration: 71, startTime: 300 }])
    observerFor('longtask').emit([{ duration: 52, startTime: 500 }])

    expect(getHudMetrics()).toMatchObject({ longTaskCount: 3, longTaskTotal: 183 })
    stop()
  })

  it('never double-counts buffered long tasks when the panel reopens', () => {
    const close = observeHud()
    observerFor('longtask').emit([{ duration: 60, startTime: 100 }])
    close()

    FakeObserver.instances.length = 0
    const stop = observeHud()
    observerFor('longtask').emit([{ duration: 60, startTime: 100 }, { duration: 80, startTime: 900 }])

    expect(getHudMetrics()).toMatchObject({ longTaskCount: 2, longTaskTotal: 140 })
    stop()
  })

  it('ignores buffered long tasks that started before the panel opened', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000)
    const stop = observeHud()

    observerFor('longtask').emit([{ duration: 90, startTime: 400 }, { duration: 55, startTime: 1_200 }])

    expect(getHudMetrics()).toMatchObject({ longTaskCount: 1, longTaskTotal: 55 })
    stop()
  })

  it('reports unsupported entry types', () => {
    vi.stubGlobal('PerformanceObserver', class extends FakeObserver {
      static override readonly supportedEntryTypes = ['event']
    })
    const stop = observeHud()

    expect(getHudMetrics().supported).toEqual({ event: true, longtask: false })
    stop()
  })

  it('samples the DOM node count every 2 s while observing and stops with the panel', () => {
    const stop = observeHud()
    const initial = getHudMetrics().domNodes ?? 0

    document.body.append(document.createElement('div'), document.createElement('div'))
    vi.advanceTimersByTime(1_999)

    expect(getHudMetrics().domNodes).toBe(initial)

    vi.advanceTimersByTime(1)

    expect(getHudMetrics().domNodes).toBe(initial + 2)

    stop()
    document.body.append(document.createElement('div'))
    vi.advanceTimersByTime(4_000)

    expect(getHudMetrics().domNodes).toBe(initial + 2)
    expect(FakeObserver.instances.every((instance) => instance.disconnected)).toBe(true)
    document.body.replaceChildren()
  })

  it('records the chart draw rate only while the panel is open and notifies subscribers', () => {
    recordDrawRate(30)

    expect(getHudMetrics().drawRate).toBeNull()

    const stop = observeHud()
    const listener = vi.fn()
    const unsubscribe = subscribeHudMetrics(listener)

    recordDrawRate(58.4)
    recordDrawRate(Number.NaN)

    expect(getHudMetrics().drawRate).toBe(58.4)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    stop()
  })

  it('persists visibility under the hud key', () => {
    expect(getHudVisible()).toBe(false)

    setHudVisible(true)

    expect(window.localStorage.getItem('hud')).toBe('on')
    resetHudForTest()
    expect(getHudVisible()).toBe(true)
  })
})

describe('draw rate meter', () => {
  it('reports frames drawn per second across a burst from rAF timestamps', () => {
    const report = vi.fn()
    const meter = createDrawRateMeter(report)

    meter.frame(1_000)
    meter.frame(1_016)
    meter.frame(1_050)
    meter.end(1_100)

    expect(report).toHaveBeenCalledWith(30)

    meter.end(2_000)

    expect(report).toHaveBeenCalledTimes(1)
  })
})
