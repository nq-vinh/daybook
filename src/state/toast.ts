import { useSyncExternalStore } from 'react'

export const MAX_VISIBLE_TOASTS = 3
export const TOAST_TICK_MS = 100
const DEFAULT_DURATION_MS = 6000

export interface ToastAction {
  readonly label: string
  readonly onAction: () => void
}

export interface ToastInput {
  readonly title: string
  readonly description?: string | undefined
  readonly action?: ToastAction | undefined
  readonly duration?: number | undefined
  readonly onDismiss?: (() => void) | undefined
}

export interface Toast {
  readonly id: string
  readonly title: string
  readonly description: string | undefined
  readonly action: ToastAction | undefined
}

const listeners = new Set<() => void>()
const remaining = new Map<string, number>()
const dismissed = new Map<string, () => void>()

let toasts: readonly Toast[] = Object.freeze([])
let nextId = 1
let paused = false
let ticker: ReturnType<typeof setInterval> | undefined

function publish(next: readonly Toast[]): void {
  toasts = Object.freeze(next)
  syncTicker()

  for (const listener of listeners) {
    listener()
  }
}

function notifyDismissed(ids: Iterable<string>): void {
  for (const id of ids) {
    const callback = dismissed.get(id)
    dismissed.delete(id)
    callback?.()
  }
}

function syncTicker(): void {
  const shouldRun = !paused && toasts.length > 0

  if (shouldRun && ticker === undefined) {
    ticker = setInterval(tick, TOAST_TICK_MS)
  } else if (!shouldRun && ticker !== undefined) {
    clearInterval(ticker)
    ticker = undefined
  }
}

function tick(): void {
  const expired = new Set<string>()

  for (const visible of toasts.slice(0, MAX_VISIBLE_TOASTS)) {
    const left = (remaining.get(visible.id) ?? 0) - TOAST_TICK_MS

    if (left <= 0) {
      expired.add(visible.id)
      remaining.delete(visible.id)
    } else {
      remaining.set(visible.id, left)
    }
  }

  if (expired.size > 0) {
    publish(toasts.filter((candidate) => !expired.has(candidate.id)))
    notifyDismissed(expired)
  }
}

export function toast({ title, description, action, duration = DEFAULT_DURATION_MS, onDismiss }: ToastInput): string {
  const id = `toast-${String(nextId)}`
  nextId += 1
  remaining.set(id, duration)
  if (onDismiss !== undefined) {
    dismissed.set(id, onDismiss)
  }
  publish([...toasts, Object.freeze({ id, title, description, action })])
  return id
}

export function dismiss(id: string): boolean {
  if (!toasts.some((candidate) => candidate.id === id)) {
    return false
  }

  remaining.delete(id)
  publish(toasts.filter((candidate) => candidate.id !== id))
  notifyDismissed([id])
  return true
}

export function dismissAllToasts(): void {
  const ids = toasts.map((candidate) => candidate.id)
  remaining.clear()
  publish([])
  notifyDismissed(ids)
}

export function setToastTimersPaused(next: boolean): void {
  paused = next
  syncTicker()
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getToasts(): readonly Toast[] {
  return toasts
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribeToasts, getToasts)
}
