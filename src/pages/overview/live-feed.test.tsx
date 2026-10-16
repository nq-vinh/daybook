import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatMoney } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import { deliverForTest, FEED_EVENTS, type FeedEvent, getEvents, startFeed, stopFeed } from '../../state/feed'
import { counterpartyName } from '../transactions/cells'
import { currentMergePoint, mergeThrough, newPaymentsLabel, splitFeed } from './feed-buffer'
import { ANNOUNCE_INTERVAL_MS, announcementText, arrivalsSince, createFeedAnnouncer } from './feed-announcer'
import { LiveFeed, VISIBLE_EVENTS } from './live-feed'
import styles from './live-feed.module.css'

function feedEvent(position: number): FeedEvent {
  const found = FEED_EVENTS[position]
  if (found === undefined) {
    throw new RangeError(`No feed event ${String(position)}`)
  }
  return found
}

function liveRegion(): HTMLElement {
  return screen.getByRole('status')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  stopFeed()
  vi.useRealTimers()
})

describe('announcementText', () => {
  it('names the amount, the counterparty and the outcome', () => {
    const settled = feedEvent(0)
    const { amount, currency } = transaction(settled.id)
    const money = formatMoney(Math.abs(amount), currency)
    const name = counterpartyName(settled.id)

    expect(announcementText({ ...settled, status: 'booked' }, 0)).toBe(`Payment of ${money} from ${name} received`)
    expect(announcementText({ ...settled, status: 'declined' }, 2)).toBe(`Payment of ${money} from ${name} declined and 2 more`)
  })
})

describe('arrivalsSince', () => {
  it('returns the events newer than the newest known one', () => {
    const [first, second, third] = [feedEvent(0), feedEvent(1), feedEvent(2)]
    expect(arrivalsSince([third, second, first], [first])).toEqual([third, second])
    expect(arrivalsSince([first], [])).toEqual([first])
    expect(arrivalsSince([], [first])).toEqual([])
  })
})

describe('createFeedAnnouncer', () => {
  it('announces at most once per 5 s and coalesces the rest into the next announcement', () => {
    const announce = vi.fn()
    const announcer = createFeedAnnouncer(announce)

    announcer.push([feedEvent(0)])
    expect(announce).toHaveBeenLastCalledWith(announcementText(feedEvent(0), 0))

    vi.advanceTimersByTime(1_000)
    announcer.push([feedEvent(1)])
    vi.advanceTimersByTime(1_000)
    announcer.push([feedEvent(2)])
    expect(announce).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS - 2_001)
    expect(announce).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(announce).toHaveBeenCalledTimes(2)
    expect(announce).toHaveBeenLastCalledWith(announcementText(feedEvent(2), 1))

    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 3)
    expect(announce).toHaveBeenCalledTimes(2)
    announcer.push([feedEvent(3)])
    expect(announce).toHaveBeenCalledTimes(3)
    announcer.dispose()
  })

  it('defers an arrival after a resume inside the cool-down until the cool-down ends', () => {
    const announce = vi.fn()
    const announcer = createFeedAnnouncer(announce)

    announcer.push([feedEvent(0)])
    announcer.pause()
    vi.advanceTimersByTime(2_000)
    announcer.resume()
    announcer.push([feedEvent(1)])
    expect(announce).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS - 2_001)
    expect(announce).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(announce).toHaveBeenCalledTimes(2)
    expect(announce).toHaveBeenLastCalledWith(announcementText(feedEvent(1), 0))
    announcer.dispose()
  })

  it('drops queued and new events while paused and keeps the 5 s spacing across a resume', () => {
    const announce = vi.fn()
    const announcer = createFeedAnnouncer(announce)

    announcer.push([feedEvent(0)])
    announcer.push([feedEvent(1)])
    announcer.pause()
    announcer.push([feedEvent(2)])
    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 2)
    expect(announce).toHaveBeenCalledTimes(1)

    announcer.resume()
    announcer.push([feedEvent(3)])
    expect(announce).toHaveBeenCalledTimes(2)
    announcer.push([feedEvent(4)])
    expect(announce).toHaveBeenCalledTimes(2)
    announcer.dispose()
    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS)
    expect(announce).toHaveBeenCalledTimes(2)
  })
})

describe('feed buffer', () => {
  const [first, second, third] = [feedEvent(0), feedEvent(1), feedEvent(2)]

  it('shows the first arrival directly when nothing is listed yet', () => {
    expect(splitFeed([first], -1)).toEqual({ shown: [first], buffered: [] })
  })

  it('buffers every later arrival until it is merged', () => {
    expect(splitFeed([third, second, first], -1)).toEqual({ shown: [first], buffered: [third, second] })
    expect(splitFeed([third, second, first], first.sequence)).toEqual({ shown: [first], buffered: [third, second] })
  })

  it('merges the buffer newest first through the newest event', () => {
    const through = mergeThrough([third, second, first], first.sequence)
    expect(through).toBe(third.sequence)
    expect(splitFeed([third, second, first], through)).toEqual({ shown: [third, second, first], buffered: [] })
  })

  it('keeps the merge point when there is nothing to merge', () => {
    expect(mergeThrough([], 4)).toBe(4)
    expect(splitFeed([], 4)).toEqual({ shown: [], buffered: [] })
  })

  it('resets the merge point when the feed empties or restarts below it', () => {
    expect(currentMergePoint([third, second, first], second.sequence)).toBe(second.sequence)
    expect(currentMergePoint([], second.sequence)).toBe(-1)
    expect(currentMergePoint([first], second.sequence)).toBe(-1)
  })

  it('counts the buffered payments in the button label', () => {
    expect(newPaymentsLabel(1)).toBe('Show 1 new payment')
    expect(newPaymentsLabel(3)).toBe('Show 3 new payments')
  })
})

describe('LiveFeed', () => {
  it('waits for the first payment, then lists settled payments newest first with at most eight visible', () => {
    render(<LiveFeed />)
    expect(screen.getByRole('heading', { level: 2, name: 'Incoming payments' })).toBeInTheDocument()
    expect(screen.getByText('Waiting for the first payment.')).toBeInTheDocument()

    act(() => {
      for (const entry of FEED_EVENTS.slice(0, 10)) {
        deliverForTest(entry)
      }
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-feed-id', String(feedEvent(0).id))
    fireEvent.click(screen.getByRole('button', { name: 'Show 9 new payments' }))

    const items = within(screen.getByRole('list', { name: 'Settled payments, newest first' })).getAllByRole('listitem')
    expect(items).toHaveLength(VISIBLE_EVENTS)
    expect(document.activeElement).toBe(within(items[0] ?? document.body).getByRole('link'))
    expect(screen.queryByRole('button', { name: /new payment/ })).not.toBeInTheDocument()
    expect(items[0]).toHaveAttribute('data-feed-id', String(feedEvent(9).id))
    expect(items[0]).toHaveAttribute('data-arrived')
    expect(within(items[0] ?? document.body).getByRole('link')).toHaveTextContent(counterpartyName(feedEvent(9).id))
    expect(screen.getByText('and 2 more')).toBeInTheDocument()
  })

  it('buffers arrivals again after stopFeed resets the store', () => {
    render(<LiveFeed />)
    act(() => {
      for (const entry of FEED_EVENTS.slice(0, 3)) {
        deliverForTest(entry)
      }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 new payments' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    act(() => {
      stopFeed()
    })
    expect(screen.getByText('Waiting for the first payment.')).toBeInTheDocument()

    act(() => {
      deliverForTest(feedEvent(0))
      deliverForTest(feedEvent(1))
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-feed-id', String(feedEvent(0).id))
    expect(screen.getByRole('button', { name: 'Show 1 new payment' })).toBeInTheDocument()
  })

  it('marks only the payments that arrive while the card is mounted', () => {
    act(() => {
      deliverForTest(feedEvent(0))
    })
    render(<LiveFeed />)
    expect(screen.getByRole('listitem')).not.toHaveAttribute('data-arrived')

    act(() => {
      deliverForTest(feedEvent(1))
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 new payment' }))
    const [newest, older] = screen.getAllByRole('listitem')
    expect(newest).toHaveAttribute('data-arrived')
    expect(older).not.toHaveAttribute('data-arrived')
  })

  it('announces through the polite status region at most once per 5 s', () => {
    render(<LiveFeed />)
    expect(liveRegion()).toHaveTextContent('')

    act(() => {
      deliverForTest(feedEvent(0))
    })
    expect(liveRegion()).toHaveTextContent(announcementText(feedEvent(0), 0))

    act(() => {
      deliverForTest(feedEvent(1))
      deliverForTest(feedEvent(2))
    })
    expect(liveRegion()).toHaveTextContent(announcementText(feedEvent(0), 0))

    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS)
    })
    expect(liveRegion()).toHaveTextContent(announcementText(feedEvent(2), 1))
  })

  it('pauses the schedule and the announcements with a pressed toggle and resumes them', () => {
    render(<LiveFeed />)
    startFeed()
    act(() => {
      vi.advanceTimersByTime(feedEvent(0).offset)
    })
    expect(getEvents()).toHaveLength(1)
    const toggle = screen.getByRole('button', { name: 'Pause' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).not.toHaveClass(styles.pressed ?? '')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveClass(styles.pressed ?? '')
    expect(toggle).toHaveAccessibleName('Pause')
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(getEvents()).toHaveLength(1)
    expect(liveRegion()).toHaveTextContent(announcementText(feedEvent(0), 0))

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    act(() => {
      vi.advanceTimersByTime(feedEvent(1).offset - feedEvent(0).offset)
    })
    expect(getEvents()).toHaveLength(2)
    expect(liveRegion()).toHaveTextContent(announcementText(feedEvent(1), 0))
  })
})
