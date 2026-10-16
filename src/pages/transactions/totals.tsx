import { defaultLocale, formatMoney } from '../../domain/format'
import type { LedgerTotals } from '../../worker/protocol'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import styles from '../transactions.module.css'

export interface TotalsProps {
  readonly totals: LedgerTotals
  readonly isReady: boolean
}

export function Totals({ totals, isReady }: TotalsProps) {
  const items = [
    { label: 'Transactions', value: new Intl.NumberFormat(defaultLocale()).format(totals.count) },
    { label: 'Debits', value: formatMoney(totals.debits, totals.currency) },
    { label: 'Credits', value: formatMoney(totals.credits, totals.currency) },
    { label: 'Net', value: formatMoney(totals.net, totals.currency) },
  ]

  return (
    <dl className={styles.totals}>
      {items.map(({ label, value }) => (
        <div key={label} className={styles.total}>
          <dt>{label}</dt>
          <dd>{isReady ? value : <Skeleton variant="text" />}</dd>
        </div>
      ))}
    </dl>
  )
}
