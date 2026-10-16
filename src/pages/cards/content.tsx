import { useEffect, useId, useState } from 'react'

import { formatMoney, formatPercent } from '../../domain/format'
import { ACCOUNTS, CARDS, type Currency } from '../../domain/world'
import { Link } from '../../router/link'
import { useRoute } from '../../router/router'
import { useFeedEvents } from '../../state/feed'
import { useEffectiveCardStatus } from '../../state/optimistic'
import { parseFilter } from '../../state/url'
import { Avatar } from '../../ui/Avatar/Avatar'
import { Badge } from '../../ui/Badge/Badge'
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { Switch } from '../../ui/Switch/Switch'
import { type LedgerClient, ledgerClient } from '../../worker/client'
import type { CardSpend } from '../../worker/protocol'
import styles from './cards.module.css'
import { setCardStatusWithUndo } from './freeze'

type Card = (typeof CARDS)[number]

const WARNING_RATIO = 0.8

export function spendMeter(spend: number, limit: number): { readonly value: number; readonly max: number; readonly high: number } {
  const max = Math.max(limit, 1)
  return { value: Math.min(Math.max(spend, 0), max), max, high: max * WARNING_RATIO }
}

export type LimitState = 'under' | 'near' | 'over'

export function limitState(spend: number, limit: number): LimitState {
  if (spend >= limit) {
    return 'over'
  }
  return spend >= limit * WARNING_RATIO ? 'near' : 'under'
}

export function limitValueText(spend: number, limit: number, currency: Currency): string {
  const amounts = `${formatMoney(spend, currency)} of ${formatMoney(limit, currency)}`
  return limit > 0 ? `${amounts} (${formatPercent(spend / limit, undefined, 0)})` : amounts
}

function CardRow({ card, accountName, spend }: { readonly card: Card; readonly accountName: string; readonly spend: CardSpend | undefined }) {
  const status = useEffectiveCardStatus(card.id)
  const frozen = status === 'frozen'
  const describedBy = useId()

  return (
    <li className={styles.row} data-frozen={frozen ? '' : undefined}>
      <div className={styles.holder}>
        <Avatar id={card.id} name={card.holder} decorative />
        <div className={styles.identity} id={describedBy}>
          <span className={styles.name}>{card.holder}</span>
          {' '}
          <span className={styles.meta}>{`card ending ${card.last4}, ${accountName}`}</span>
        </div>
        {frozen && <Badge>Frozen</Badge>}
        {spend !== undefined && limitState(spend.monthToDate, card.monthlyLimit) === 'over' && <Badge tone="negative">Over limit</Badge>}
        {spend !== undefined && limitState(spend.monthToDate, card.monthlyLimit) === 'near' && <Badge tone="warning">Near limit</Badge>}
      </div>
      <div className={styles.spend}>
        {spend === undefined
          ? <Skeleton variant="text" lines={2} />
          : (
            <ProgressBar
              label="Spent this month"
              {...spendMeter(spend.monthToDate, card.monthlyLimit)}
              valueText={limitValueText(spend.monthToDate, card.monthlyLimit, spend.currency)}
              aria-describedby={describedBy}
            />
          )}
      </div>
      <div className={styles.actions}>
        <Switch
          label="Frozen"
          checked={frozen}
          aria-describedby={describedBy}
          onChange={(event) => {
            setCardStatusWithUndo(card, event.currentTarget.checked ? 'frozen' : 'active')
          }}
        />
        <Link className={styles.link} to={`/transactions?card=${card.id}`} aria-describedby={describedBy}>
          View transactions
        </Link>
      </div>
    </li>
  )
}

export function CardsContent({ client = ledgerClient }: { readonly client?: LedgerClient }) {
  const { location } = useRoute()
  const account = parseFilter(location.search).account
  const [spend, setSpend] = useState<readonly CardSpend[] | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const feedVersion = useFeedEvents().length

  useEffect(() => {
    let current = true
    client.cards().then(
      (found) => {
        if (current) {
          setSpend(found)
        }
      },
      (reason: unknown) => {
        if (current) {
          setFailure(reason instanceof Error ? reason : new Error('The card spend request failed.'))
        }
      },
    )
    return () => {
      current = false
    }
  }, [client, feedVersion])

  if (failure !== null) {
    throw failure
  }

  const accounts = ACCOUNTS.filter((candidate) => account === null || candidate.id === account)

  return (
    <div className={styles.root} aria-busy={spend === null}>
      {accounts.map((group) => (
        <section key={group.id} className={styles.section} aria-labelledby={`cards-${group.id}`}>
          <h2 id={`cards-${group.id}`}>{group.name}</h2>
          <ul className={styles.list}>
            {CARDS.filter((card) => card.accountId === group.id).map((card) => (
              <CardRow
                key={card.id}
                card={card}
                accountName={group.name}
                spend={spend?.find((entry) => entry.cardId === card.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
