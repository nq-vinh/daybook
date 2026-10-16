import { formatMoney } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import type { FeedEvent } from '../../state/feed'
import { counterpartyName } from '../transactions/cells'

export const ANNOUNCE_INTERVAL_MS = 5_000

export interface FeedAnnouncer {
  push(arrivals: readonly FeedEvent[]): void
  pause(): void
  resume(): void
  dispose(): void
}

export function announcementText(event: FeedEvent, more: number): string {
  const { amount, currency } = transaction(event.id)
  const name = counterpartyName(event.id)
  const money = formatMoney(Math.abs(amount), currency)
  const payment = amount >= 0 ? `Payment of ${money} from ${name}` : `Payment of ${money} to ${name}`
  const outcome = event.status === 'declined' ? 'declined' : amount >= 0 ? 'received' : 'booked'
  return more > 0 ? `${payment} ${outcome} and ${String(more)} more` : `${payment} ${outcome}`
}

export function arrivalsSince(events: readonly FeedEvent[], known: readonly FeedEvent[]): readonly FeedEvent[] {
  const newestKnown = known[0]
  const boundary = newestKnown === undefined ? -1 : events.indexOf(newestKnown)
  return events.slice(0, boundary === -1 ? events.length : boundary)
}

export function createFeedAnnouncer(announce: (text: string) => void, interval = ANNOUNCE_INTERVAL_MS): FeedAnnouncer {
  let queued: readonly FeedEvent[] = []
  let cooling: ReturnType<typeof setTimeout> | undefined
  let paused = false

  function flush(): void {
    const [newest, ...older] = queued
    if (newest === undefined) {
      return
    }
    queued = []
    announce(announcementText(newest, older.length))
    cooling = setTimeout(() => {
      cooling = undefined
      flush()
    }, interval)
  }

  return {
    push(arrivals) {
      if (paused || arrivals.length === 0) {
        return
      }
      queued = [...arrivals, ...queued]
      if (cooling === undefined) {
        flush()
      }
    },
    pause() {
      paused = true
      queued = []
    },
    resume() {
      paused = false
    },
    dispose() {
      clearTimeout(cooling)
      cooling = undefined
      queued = []
    },
  }
}
