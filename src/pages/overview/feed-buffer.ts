import type { FeedEvent } from '../../state/feed'

export interface FeedSplit {
  readonly shown: readonly FeedEvent[]
  readonly buffered: readonly FeedEvent[]
}

export function splitFeed(events: readonly FeedEvent[], mergedThrough: number): FeedSplit {
  const oldest = events.at(-1)
  const through = mergedThrough < 0 && oldest !== undefined ? oldest.sequence : mergedThrough
  return {
    shown: events.filter((event) => event.sequence <= through),
    buffered: events.filter((event) => event.sequence > through),
  }
}

export function currentMergePoint(events: readonly FeedEvent[], mergedThrough: number): number {
  const newest = events[0]
  return newest === undefined || newest.sequence < mergedThrough ? -1 : mergedThrough
}

export function mergeThrough(events: readonly FeedEvent[], mergedThrough: number): number {
  return events[0]?.sequence ?? mergedThrough
}

export function newPaymentsLabel(count: number): string {
  return count === 1 ? 'Show 1 new payment' : `Show ${String(count)} new payments`
}
