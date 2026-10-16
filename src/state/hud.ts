import { useSyncExternalStore } from 'react'

export interface HudMetrics {
  readonly worstInteraction: number | null
  readonly longTaskCount: number
  readonly longTaskTotal: number
  readonly domNodes: number | null
  readonly drawRate: number | null
  readonly supported: { readonly event: boolean; readonly longtask: boolean }
}

const STORAGE_KEY = 'hud'
const DOM_SAMPLE_MS = 2_000
const INTERACTION_THRESHOLD_MS = 16

const EMPTY: HudMetrics = {
  worstInteraction: null,
  longTaskCount: 0,
  longTaskTotal: 0,
  domNodes: null,
  drawRate: null,
  supported: { event: true, longtask: true },
}

const metricListeners = new Set<() => void>()
const visibilityListeners = new Set<() => void>()

let metrics = EMPTY
let visible: boolean | null = null
let observing = false
let longTaskWatermark = Number.NEGATIVE_INFINITY

function readStoredVisibility(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function update(patch: Partial<HudMetrics>): void {
  metrics = { ...metrics, ...patch }
  for (const listener of metricListeners) {
    listener()
  }
}

export function subscribeHudMetrics(listener: () => void): () => void {
  metricListeners.add(listener)
  return () => {
    metricListeners.delete(listener)
  }
}

export function getHudMetrics(): HudMetrics {
  return metrics
}

export function useHudMetrics(): HudMetrics {
  return useSyncExternalStore(subscribeHudMetrics, getHudMetrics)
}

export function subscribeHudVisible(listener: () => void): () => void {
  visibilityListeners.add(listener)
  return () => {
    visibilityListeners.delete(listener)
  }
}

export function getHudVisible(): boolean {
  visible ??= readStoredVisibility()
  return visible
}

function storeVisibility(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    return
  }
}

export function setHudVisible(next: boolean): void {
  visible = next
  storeVisibility(next)
  for (const listener of visibilityListeners) {
    listener()
  }
}

export function useHudVisible(): boolean {
  return useSyncExternalStore(subscribeHudVisible, getHudVisible, () => false)
}

export function recordDrawRate(framesPerSecond: number): void {
  if (observing && Number.isFinite(framesPerSecond) && framesPerSecond > 0) {
    update({ drawRate: framesPerSecond })
  }
}

function supports(type: string): boolean {
  return typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes(type)
}

function observe(type: 'event' | 'longtask', handle: (entries: PerformanceEntryList) => void): PerformanceObserver | null {
  if (!supports(type)) {
    return null
  }
  const observer = new PerformanceObserver((list) => {
    handle(list.getEntries())
  })
  const options: PerformanceObserverInit & { readonly durationThreshold?: number } = type === 'event'
    ? { type, buffered: true, durationThreshold: INTERACTION_THRESHOLD_MS }
    : { type, buffered: true }
  observer.observe(options)
  return observer
}

function isInteraction(entry: PerformanceEntry): boolean {
  return !('interactionId' in entry) || (typeof entry.interactionId === 'number' && entry.interactionId > 0)
}

function sampleDomNodes(): void {
  update({ domNodes: document.querySelectorAll('*').length })
}

export function observeHud(): () => void {
  observing = true
  longTaskWatermark = Math.max(longTaskWatermark, performance.now())
  update({ supported: { event: supports('event'), longtask: supports('longtask') } })
  const interactions = observe('event', (entries) => {
    const worst = entries.filter(isInteraction).reduce((max, entry) => Math.max(max, entry.duration), metrics.worstInteraction ?? 0)
    if (worst > 0) {
      update({ worstInteraction: worst })
    }
  })
  const longTasks = observe('longtask', (entries) => {
    const fresh = entries.filter((entry) => entry.startTime > longTaskWatermark)
    if (fresh.length === 0) {
      return
    }
    longTaskWatermark = Math.max(longTaskWatermark, ...fresh.map((entry) => entry.startTime))
    update({
      longTaskCount: metrics.longTaskCount + fresh.length,
      longTaskTotal: fresh.reduce((sum, entry) => sum + entry.duration, metrics.longTaskTotal),
    })
  })

  sampleDomNodes()
  const sampler = setInterval(sampleDomNodes, DOM_SAMPLE_MS)

  return () => {
    observing = false
    interactions?.disconnect()
    longTasks?.disconnect()
    clearInterval(sampler)
  }
}

export function resetHudForTest(): void {
  metrics = EMPTY
  visible = null
  observing = false
  longTaskWatermark = Number.NEGATIVE_INFINITY
}
