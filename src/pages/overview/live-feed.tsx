import { useEffect, useId, useState } from 'react'

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
import { counterpartyName, transactionHref } from '../transactions/cells'
import { arrivalsSince, createFeedAnnouncer } from './feed-announcer'
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
      <span className={styles.amount}>{formatSignedMoney(amount, currency)}</span>
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
  const hidden = events.length - VISIBLE_EVENTS

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId}>Incoming payments</h2>
        <Button
          variant="secondary"
          size="sm"
          className={cx(paused && styles.pressed)}
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
      {events.length === 0
        ? <EmptyState compact headingLevel={3} title="Waiting for the first payment." description="Payments appear here as they settle." />
        : (
            <ol className={styles.list} aria-label="Settled payments, newest first">
              {events.slice(0, VISIBLE_EVENTS).map((event) => (
                <FeedItem key={event.sequence} event={event} arrived={event.sequence > newestAtMount} />
              ))}
            </ol>
          )}
      {hidden > 0 && <p className={styles.more}>{`and ${String(hidden)} more`}</p>}
      <p role="status" aria-atomic="true" className="visually-hidden">{announcement}</p>
    </section>
  )
}
