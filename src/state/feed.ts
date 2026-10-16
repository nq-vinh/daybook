import { useSyncExternalStore } from 'react'

import { hashCombine, mulberry32, WORLD_SEED } from '../domain/prng'
import { transaction, TRANSACTION_COUNT, transactionStatus } from '../domain/transactions'
import type { FeedSettlement, SettledStatus } from '../worker/protocol'

export type { SettledStatus } from '../worker/protocol'

export interface FeedEvent {
  readonly sequence: number
  readonly id: number
  readonly status: SettledStatus
  readonly offset: number
}

export const FEED_EVENT_COUNT = 60
export const FIRST_EVENT_MS = 4_000
export const MIN_GAP_MS = 3_000
export const MAX_GAP_MS = 12_000
export const MAX_EVENTS_PER_COUNTERPARTY = 2
const BOOKED_SHARE = 0.9
const FEED_SEED = hashCombine(WORLD_SEED, ...Array.from('feed', (char) => char.charCodeAt(0)))

interface Candidate {
  readonly id: number
  readonly counterpartyId: string
}

function pendingCandidates(): { readonly credits: Candidate[]; readonly debits: Candidate[] } {
  const credits: Candidate[] = []
  const debits: Candidate[] = []
  for (let id = 0; id < TRANSACTION_COUNT; id += 1) {
    if (transactionStatus(id) === 'pending') {
      const { amount, counterpartyId } = transaction(id)
      const pool = amount > 0 ? credits : debits
      pool.push({ id, counterpartyId })
    }
  }
  return { credits, debits }
}

function drawFrom(pool: Candidate[], roll: number): Candidate | undefined {
  const index = Math.floor(roll * pool.length)
  const drawn = pool[index]
  const last = pool.pop()
  if (last !== undefined && index < pool.length) {
    pool[index] = last
  }
  return drawn
}

function seededEvents(): readonly FeedEvent[] {
  const { credits, debits } = pendingCandidates()
  const random = mulberry32(FEED_SEED)
  const perCounterparty = new Map<string, number>()
  const events: FeedEvent[] = []
  let offset = FIRST_EVENT_MS

  while (events.length < FEED_EVENT_COUNT && credits.length + debits.length > 0) {
    const drawn = drawFrom(credits.length > 0 ? credits : debits, random())
    const seen = drawn === undefined ? 0 : (perCounterparty.get(drawn.counterpartyId) ?? 0)
    if (drawn !== undefined && seen < MAX_EVENTS_PER_COUNTERPARTY) {
      perCounterparty.set(drawn.counterpartyId, seen + 1)
      const status: SettledStatus = random() < BOOKED_SHARE ? 'booked' : 'declined'
      events.push(Object.freeze({ sequence: events.length, id: drawn.id, status, offset }))
      offset += MIN_GAP_MS + Math.floor(random() * (MAX_GAP_MS - MIN_GAP_MS + 1))
    }
  }

  return Object.freeze(events)
}

export const FEED_EVENTS = seededEvents()

const eventListeners = new Set<() => void>()
const pausedListeners = new Set<() => void>()
const rowListeners = new Map<number, Set<() => void>>()
const overrides = new Map<number, SettledStatus>()

let delivered: readonly FeedEvent[] = Object.freeze([])
let paused = false
let started = false
let cursor = 0
let timer: ReturnType<typeof setTimeout> | undefined

function notify(listeners: Iterable<() => void> | undefined): void {
  for (const listener of [...(listeners ?? [])]) {
    listener()
  }
}

function deliver(event: FeedEvent): void {
  overrides.set(event.id, event.status)
  delivered = Object.freeze([event, ...delivered])
  notify(rowListeners.get(event.id))
  notify(eventListeners)
}

function clearTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

function scheduleNext(): void {
  const event = FEED_EVENTS[cursor]
  if (!started || paused || timer !== undefined || event === undefined) {
    return
  }
  const previousOffset = FEED_EVENTS[cursor - 1]?.offset ?? 0
  timer = setTimeout(() => {
    timer = undefined
    cursor += 1
    deliver(event)
    scheduleNext()
  }, event.offset - previousOffset)
}

export function subscribeEvents(listener: () => void): () => void {
  eventListeners.add(listener)
  return () => {
    eventListeners.delete(listener)
  }
}

export function getEvents(): readonly FeedEvent[] {
  return delivered
}

export function settlements(events: readonly FeedEvent[]): readonly FeedSettlement[] {
  return events.map((event) => [event.id, event.status] as const)
}

export function subscribeRow(id: number, listener: () => void): () => void {
  let listeners = rowListeners.get(id)
  if (listeners === undefined) {
    listeners = new Set()
    rowListeners.set(id, listeners)
  }
  const registered = listeners
  registered.add(listener)
  return () => {
    registered.delete(listener)
    if (registered.size === 0 && rowListeners.get(id) === registered) {
      rowListeners.delete(id)
    }
  }
}

export function getRowOverride(id: number): SettledStatus | undefined {
  return overrides.get(id)
}

export function rowListenerCount(id: number): number {
  return rowListeners.get(id)?.size ?? 0
}

export function subscribePaused(listener: () => void): () => void {
  pausedListeners.add(listener)
  return () => {
    pausedListeners.delete(listener)
  }
}

export function isPaused(): boolean {
  return paused
}

export function pause(): void {
  if (paused) {
    return
  }
  paused = true
  clearTimer()
  notify(pausedListeners)
}

export function resume(): void {
  if (!paused) {
    return
  }
  paused = false
  notify(pausedListeners)
  scheduleNext()
}

export function startFeed(): void {
  if (started) {
    return
  }
  started = true
  scheduleNext()
}

export function stopFeed(): void {
  clearTimer()
  const settledIds = [...overrides.keys()]
  started = false
  paused = false
  cursor = 0
  overrides.clear()
  delivered = Object.freeze([])
  for (const id of settledIds) {
    notify(rowListeners.get(id))
  }
  notify(eventListeners)
  notify(pausedListeners)
}

export function deliverForTest(event: FeedEvent): void {
  deliver(event)
}

export function useFeedEvents(): readonly FeedEvent[] {
  return useSyncExternalStore(subscribeEvents, getEvents)
}

export function useFeedRow(id: number): SettledStatus | undefined {
  return useSyncExternalStore((listener) => subscribeRow(id, listener), () => getRowOverride(id))
}

export function useFeedPaused(): boolean {
  return useSyncExternalStore(subscribePaused, isPaused)
}
