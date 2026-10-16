import { defaultLocale, formatMoney, formatSignedMoney } from '../../domain/format'
import type { LedgerTotals } from '../../worker/protocol'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import styles from '../transactions.module.css'

export interface TotalsProps {
  readonly totals: LedgerTotals
  readonly isReady: boolean
}

type Tone = 'positive' | 'negative' | undefined

function toneOf(net: number): Tone {
  if (net === 0) {
    return undefined
  }
  return net > 0 ? 'positive' : 'negative'
}

export function Totals({ totals, isReady }: TotalsProps) {
  const items: readonly { readonly label: string; readonly value: string; readonly tone?: Tone }[] = [
    { label: 'Transactions', value: new Intl.NumberFormat(defaultLocale()).format(totals.count) },
    { label: 'Debits', value: formatMoney(totals.debits, totals.currency) },
    { label: 'Credits', value: formatMoney(totals.credits, totals.currency) },
    { label: 'Net', value: formatSignedMoney(totals.net, totals.currency), tone: toneOf(totals.net) },
  ]

  return (
    <dl className={styles.totals}>
      {items.map(({ label, value, tone }) => (
        <div key={label} className={styles.total}>
          <dt>{label}</dt>
          <dd data-tone={isReady ? tone : undefined}>{isReady ? value : <Skeleton variant="text" />}</dd>
        </div>
      ))}
    </dl>
  )
}
