import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PENDING_WINDOW_MS, transaction } from '../domain/transactions'
import { TODAY } from '../domain/world'
import {
  deliverForTest,
  FEED_EVENT_COUNT,
  FEED_EVENTS,
  type FeedEvent,
  FIRST_EVENT_MS,
  getEvents,
  getRowOverride,
  isPaused,
  MAX_EVENTS_PER_COUNTERPARTY,
  MAX_GAP_MS,
  MIN_GAP_MS,
  pause,
  resume,
  rowListenerCount,
  startFeed,
  stopFeed,
  subscribeEvents,
  subscribePaused,
  subscribeRow,
} from './feed'

const VISIBLE_CREDITS = 8

function event(position: number): FeedEvent {
  const found = FEED_EVENTS[position]
  if (found === undefined) {
    throw new RangeError(`No feed event ${String(position)}`)
  }
  return found
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  stopFeed()
  vi.useRealTimers()
})

describe('feed sequence', () => {
  it('settles at most two payments per counterparty', () => {
    const perCounterparty = new Map<string, number>()
    for (const entry of FEED_EVENTS) {
      const { counterpartyId } = transaction(entry.id)
      perCounterparty.set(counterpartyId, (perCounterparty.get(counterpartyId) ?? 0) + 1)
    }
    expect(Math.max(...perCounterparty.values())).toBeLessThanOrEqual(MAX_EVENTS_PER_COUNTERPARTY)
  })

  it('settles 60 distinct pending transactions of the last 14 days, incoming payments first', () => {
    expect(FEED_EVENTS).toHaveLength(FEED_EVENT_COUNT)
    expect(Object.isFrozen(FEED_EVENTS)).toBe(true)
    expect(new Set(FEED_EVENTS.map((entry) => entry.id)).size).toBe(FEED_EVENT_COUNT)
    for (const entry of FEED_EVENTS) {
      const seeded = transaction(entry.id)
      expect(seeded.status).toBe('pending')
      expect(seeded.bookedAt).toBeGreaterThan(TODAY - PENDING_WINDOW_MS)
    }
    const firstDebit = FEED_EVENTS.findIndex((entry) => transaction(entry.id).amount < 0)
    expect(firstDebit).toBeGreaterThan(VISIBLE_CREDITS)
    expect(FEED_EVENTS.slice(firstDebit).every((entry) => transaction(entry.id).amount < 0)).toBe(true)
    const declined = FEED_EVENTS.filter((entry) => entry.status === 'declined').length
    expect(declined).toBeGreaterThan(0)
    expect(declined).toBeLessThan(FEED_EVENT_COUNT * 0.25)
  })

  it('schedules the first event at 4 s and every later one 6 to 14 s after the previous', () => {
    expect(event(0).offset).toBe(FIRST_EVENT_MS)
    FEED_EVENTS.forEach((entry, position) => {
      expect(entry.sequence).toBe(position)
      if (position > 0) {
        const gap = entry.offset - event(position - 1).offset
        expect(gap).toBeGreaterThanOrEqual(MIN_GAP_MS)
        expect(gap).toBeLessThanOrEqual(MAX_GAP_MS)
      }
    })
  })

  it('pins the fifth event and the sequence', () => {
    expect(event(4)).toMatchInlineSnapshot(`
      {
        "id": 5716,
        "offset": 33341,
        "sequence": 4,
        "status": "booked",
      }
    `)
    expect(FEED_EVENTS.map((entry) => `${String(entry.id)}:${entry.status[0] ?? ''}:${String(entry.offset)}`).slice(0, 8)).toMatchInlineSnapshot(`
      [
        "7699:b:4000",
        "67225:b:9640",
        "67871:b:14758",
        "15084:b:25162",
        "5716:b:33341",
        "85636:b:41860",
        "73286:b:49129",
        "25633:b:58619",
      ]
    `)
  })
})

describe('feed schedule', () => {
  it('delivers nothing until started and then follows the offsets, newest first', () => {
    vi.advanceTimersByTime(60_000)
    expect(getEvents()).toEqual([])

    startFeed()
    startFeed()
    vi.advanceTimersByTime(FIRST_EVENT_MS - 1)
    expect(getEvents()).toEqual([])
    vi.advanceTimersByTime(1)
    expect(getEvents()).toEqual([event(0)])

    vi.advanceTimersByTime(event(4).offset - FIRST_EVENT_MS)
    expect(getEvents()).toEqual([event(4), event(3), event(2), event(1), event(0)])
    expect(Object.isFrozen(getEvents())).toBe(true)
    expect(getRowOverride(event(4).id)).toBe(event(4).status)
  })

  it('stops after the last event', () => {
    startFeed()
    vi.advanceTimersByTime(FEED_EVENTS.at(-1)?.offset ?? 0)
    expect(getEvents()).toHaveLength(FEED_EVENT_COUNT)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses the schedule and resumes with the full gap to the next event', () => {
    const changes = vi.fn()
    const stop = subscribePaused(changes)
    startFeed()
    vi.advanceTimersByTime(FIRST_EVENT_MS)

    pause()
    pause()
    expect(isPaused()).toBe(true)
    expect(changes).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(MAX_GAP_MS * 4)
    expect(getEvents()).toHaveLength(1)

    resume()
    expect(changes).toHaveBeenCalledTimes(2)
    const gap = event(1).offset - event(0).offset
    vi.advanceTimersByTime(gap - 1)
    expect(getEvents()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(getEvents()[0]).toBe(event(1))
    stop()
  })
})

describe('feed subscriptions', () => {
  it('notifies only the listeners of the settled row and removes them on cleanup', () => {
    const settled = event(0)
    const other = event(1)
    const settledListener = vi.fn()
    const otherListener = vi.fn()
    const eventsListener = vi.fn()
    const stopSettled = subscribeRow(settled.id, settledListener)
    const stopOther = subscribeRow(other.id, otherListener)
    const stopEvents = subscribeEvents(eventsListener)

    expect(getRowOverride(settled.id)).toBeUndefined()
    deliverForTest(settled)

    expect(settledListener).toHaveBeenCalledTimes(1)
    expect(otherListener).not.toHaveBeenCalled()
    expect(eventsListener).toHaveBeenCalledTimes(1)
    expect(getRowOverride(settled.id)).toBe(settled.status)
    expect(getRowOverride(settled.id)).toBe(getRowOverride(settled.id))

    stopSettled()
    stopOther()
    stopEvents()
    expect(rowListenerCount(settled.id)).toBe(0)
    expect(rowListenerCount(other.id)).toBe(0)
  })

  it('resets the delivered events and overrides on stop and notifies the settled rows', () => {
    const settled = event(0)
    const listener = vi.fn()
    const stopRow = subscribeRow(settled.id, listener)
    deliverForTest(settled)

    stopFeed()

    expect(getEvents()).toEqual([])
    expect(getRowOverride(settled.id)).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)
    stopRow()
  })
})
