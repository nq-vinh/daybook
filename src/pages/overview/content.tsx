import { useEffect, useState } from 'react'

import { defaultLocale, formatDate, formatMoney, formatPercent, formatSignedMoney } from '../../domain/format'
import { transaction } from '../../domain/transactions'
import { ACCOUNTS, type AccountId, type Currency } from '../../domain/world'
import { Link } from '../../router/link'
import { useRoute } from '../../router/router'
import type { SettledStatus } from '../../state/feed'
import { useFeedEvents } from '../../state/feed'
import { parseFilter } from '../../state/url'
import { CashFlowChart } from '../../ui/charts/CashFlowChart'
import { chartMonths } from '../../ui/charts/months'
import { Sparkline } from '../../ui/charts/Sparkline'
import { EmptyState } from '../../ui/EmptyState/EmptyState'
import { ScrollRegion } from '../../ui/ScrollRegion/ScrollRegion'
import { StatTile } from '../../ui/StatTile/StatTile'
import { cx } from '../../ui/classes'
import { Table, type TableColumn } from '../../ui/Table/Table'
import { type LedgerClient, ledgerClient } from '../../worker/client'
import type { AccountBalance, CategoryShare, LedgerOverview } from '../../worker/protocol'
import { categoryLabel, CategoryLabel, counterpartyName, feedRows, SignedAmount, Status, transactionHref } from '../transactions/cells'
import {
  CategoriesSkeleton,
  ChartSkeleton,
  LatestSkeleton,
  OverviewLayout,
  TileSkeletons,
  useScopeCount,
} from './layout'
import { LiveFeed } from './live-feed'
import styles from './overview.module.css'

interface ScopedOverview {
  readonly account: AccountId | null
  readonly feedVersion: number
  readonly overview: LedgerOverview
}

const SMALL_SHARE = 0.005

const accountNames = new Map<string, string>(ACCOUNTS.map((account) => [account.id, account.name]))

const latestColumns: readonly TableColumn<number, SettledStatus>[] = [
  { key: 'bookedAt', header: 'Date', cell: (id) => formatDate(transaction(id).bookedAt) },
  { key: 'counterparty', header: 'Counterparty', cell: (id) => <Link to={transactionHref(id)}>{counterpartyName(id)}</Link> },
  { key: 'category', header: 'Category', cell: (id) => <CategoryLabel id={id} />, truncate: true },
  { key: 'amount', header: 'Amount', cell: (id, settled) => <SignedAmount id={id} settled={settled} />, numeric: true },
  { key: 'status', header: 'Status', cell: (id, settled) => <Status id={id} settled={settled} /> },
]

function identity(id: number): number {
  return id
}

function rowLabel(id: number): string {
  return counterpartyName(id)
}

function BalanceTile({ balance, locale }: { readonly balance: AccountBalance; readonly locale: string }) {
  const { accountId, currency, last30Days } = balance
  const first = last30Days[0] ?? balance.balance
  const change = balance.balance - first

  return (
    <StatTile
      className={styles.tile}
      label={accountNames.get(accountId) ?? accountId}
      value={formatMoney(balance.balance, currency, locale)}
      delta={{
        value: formatSignedMoney(change, currency, locale),
        label: 'over 30 days',
        trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
        tone: change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral',
      }}
    >
      <Sparkline
        points={last30Days}
        label={`30-day balance, from ${formatMoney(first, currency, locale)} to ${formatMoney(last30Days.at(-1) ?? balance.balance, currency, locale)}`}
      />
    </StatTile>
  )
}

export function shareText(share: number, locale: string): string {
  return share > 0 && share < SMALL_SHARE ? `<${formatPercent(0.01, locale, 0)}` : formatPercent(share, locale, 0)
}

function shareRef(share: number) {
  return (bar: HTMLSpanElement | null) => {
    bar?.style.setProperty('--share', `${String(Math.min(1, Math.max(0, share)) * 100)}%`)
  }
}

function TopCategories({ entries, currency, locale }: {
  readonly entries: readonly CategoryShare[]
  readonly currency: Currency
  readonly locale: string
}) {
  if (entries.length === 0) {
    return <EmptyState compact headingLevel={3} title="No spending this month yet." description="Categories appear here once money goes out." />
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-redundant-roles -- list-style none drops list semantics in WebKit
    <ol className={styles.categories} role="list">
      {entries.map((entry) => (
        <li key={entry.categoryId} className={styles.category}>
          <span className={styles.categoryName}>{categoryLabel(entry.categoryId)}</span>
          <span className={cx(styles.categoryAmount, 'money')}>{formatMoney(entry.monthToDate, currency, locale)}</span>
          <span className={styles.categoryShare}>{shareText(entry.share, locale)}</span>
          <span ref={shareRef(entry.share)} className={styles.bar} aria-hidden="true" />
        </li>
      ))}
    </ol>
  )
}

export function OverviewContent({ client = ledgerClient }: { readonly client?: LedgerClient }) {
  const { location } = useRoute()
  const account = parseFilter(location.search).account
  const count = useScopeCount()
  const feedVersion = useFeedEvents().length
  const [scoped, setScoped] = useState<ScopedOverview | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const locale = defaultLocale()

  useEffect(() => {
    let current = true
    client.overview(account).then(
      (overview) => {
        if (current) {
          setScoped({ account, feedVersion, overview })
        }
      },
      (reason: unknown) => {
        if (current) {
          setFailure(reason instanceof Error ? reason : new Error('The overview request failed.'))
        }
      },
    )
    return () => {
      current = false
    }
  }, [client, account, feedVersion])

  if (failure !== null) {
    throw failure
  }

  if (scoped === null) {
    return (
      <OverviewLayout
        busy
        tiles={<TileSkeletons count={count} />}
        chart={<ChartSkeleton />}
        feed={<LiveFeed />}
        categories={<CategoriesSkeleton />}
        latest={<LatestSkeleton />}
      />
    )
  }

  const { overview } = scoped

  return (
    <OverviewLayout
      busy={scoped.account !== account || scoped.feedVersion !== feedVersion}
      feedVersion={scoped.feedVersion}
      tiles={overview.balances.map((balance) => <BalanceTile key={balance.accountId} balance={balance} locale={locale} />)}
      chart={<CashFlowChart months={chartMonths(overview.months, locale)} currency={overview.currency} locale={locale} caption="Net cash flow by month" />}
      feed={<LiveFeed />}
      categories={<TopCategories entries={overview.topCategories} currency={overview.currency} locale={locale} />}
      latest={(
        <ScrollRegion label="Latest activity, scrolls sideways" className={styles.latest}>
          <Table
            caption="Latest activity"
            hideCaption
            className={styles.latestTable}
            columns={latestColumns}
            rows={overview.latest}
            getRowKey={identity}
            getRowLabel={rowLabel}
            rowState={feedRows}
            rowFocus={false}
          />
        </ScrollRegion>
      )}
    />
  )
}
