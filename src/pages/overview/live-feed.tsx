import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { formatDate, formatSignedMoney } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import { TODAY } from '../../domain/world'
import { Link } from '../../router/link'
import {
  type FeedEvent,
  getEvents,
  isPaused,
  pause,
  resume,
  subscribeEvents,
  subscribePaused,
  useFeedEvents,
  useFeedPaused,
} from '../../state/feed'
import { Badge } from '../../ui/Badge/Badge'
import { EmptyState } from '../../ui/EmptyState/EmptyState'
import { Button } from '../../ui/Button/Button'
import { cx } from '../../ui/classes'
import { ScrollRegion } from '../../ui/ScrollRegion/ScrollRegion'
import { counterpartyName, transactionHref } from '../transactions/cells'
import { arrivalsSince, createFeedAnnouncer } from './feed-announcer'
import { currentMergePoint, mergeThrough, newPaymentsLabel, splitFeed } from './feed-buffer'
import styles from './live-feed.module.css'

export const VISIBLE_EVENTS = 8

const TIME_FORMAT: Intl.DateTimeFormatOptions = { timeStyle: 'medium' }

function useFeedAnnouncement(): string {
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const announcer = createFeedAnnouncer(setAnnouncement)
    let known = getEvents()
    const syncPaused = () => {
      if (isPaused()) {
        announcer.pause()
      } else {
        announcer.resume()
      }
    }
    syncPaused()
    const stopEvents = subscribeEvents(() => {
      const events = getEvents()
      announcer.push(arrivalsSince(events, known))
      known = events
    })
    const stopPaused = subscribePaused(syncPaused)
    return () => {
      stopEvents()
      stopPaused()
      announcer.dispose()
    }
  }, [])

  return announcement
}

function FeedItem({ event, arrived }: { readonly event: FeedEvent; readonly arrived: boolean }) {
  const { amount, currency } = transaction(event.id)
  const at = TODAY + event.offset

  return (
    <li className={styles.item} data-arrived={arrived ? '' : undefined} data-feed-id={event.id}>
      <Link className={styles.name} to={transactionHref(event.id)}>{counterpartyName(event.id)}</Link>
      <span className={cx(styles.amount, 'money')}>{formatSignedMoney(amount, currency)}</span>
      {event.status === 'booked' ? <Badge tone="positive">Booked</Badge> : <Badge tone="negative">Declined</Badge>}
      <time className={styles.time} dateTime={new Date(at).toISOString()}>{formatDate(at, undefined, TIME_FORMAT)}</time>
    </li>
  )
}

export function LiveFeed() {
  const headingId = useId()
  const events = useFeedEvents()
  const paused = useFeedPaused()
  const announcement = useFeedAnnouncement()
  const [newestAtMount] = useState(() => events[0]?.sequence ?? -1)
  const [storedMergePoint, setMergedThrough] = useState(newestAtMount)
  const mergedThrough = currentMergePoint(events, storedMergePoint)
  if (mergedThrough !== storedMergePoint) {
    setMergedThrough(mergedThrough)
  }
  const listRef = useRef<HTMLOListElement | null>(null)
  const { shown, buffered } = splitFeed(events, mergedThrough)
  const hidden = shown.length - VISIBLE_EVENTS

  function showBuffered(): void {
    flushSync(() => {
      setMergedThrough(mergeThrough(events, mergedThrough))
    })
    const list = listRef.current
    const region = list?.closest('[data-scroll-region]')
    if (region) {
      region.scrollTop = 0
    }
    list?.querySelector('a')?.focus({ preventScroll: true })
  }

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId}>Incoming payments</h2>
        {buffered.length > 0 && (
          <Button variant="secondary" size="sm" className={styles.show} onClick={showBuffered}>{newPaymentsLabel(buffered.length)}</Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          className={cx(styles.pause, paused && styles.pressed)}
          aria-pressed={paused}
          onClick={() => {
            if (paused) {
              resume()
            } else {
              pause()
            }
          }}
        >
          Pause
        </Button>
      </div>
      {shown.length === 0
        ? <EmptyState compact headingLevel={3} title="Waiting for the first payment." description="Payments appear here as they settle." />
        : (
            <ScrollRegion axis="block" label="Settled payments, scrolls" className={styles.scroller}>
              {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- list-style none drops list semantics in WebKit */}
              <ol ref={listRef} className={styles.list} role="list" aria-label="Settled payments, newest first">
                {shown.slice(0, VISIBLE_EVENTS).map((event) => (
                  <FeedItem key={event.sequence} event={event} arrived={event.sequence > newestAtMount} />
                ))}
              </ol>
            </ScrollRegion>
          )}
      {hidden > 0 && <p className={styles.more}>{`and ${String(hidden)} more`}</p>}
      <p role="status" aria-atomic="true" className="visually-hidden">{announcement}</p>
    </section>
  )
}
