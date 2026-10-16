import { useId, type ReactNode } from 'react'

import { ACCOUNTS } from '../../domain/world'
import { useRoute } from '../../router/router'
import { parseFilter } from '../../state/url'
import { cx } from '../../ui/classes'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import styles from './overview.module.css'

interface OverviewLayoutProps {
  readonly busy: boolean
  readonly feedVersion?: number | undefined
  readonly tiles: ReactNode
  readonly chart: ReactNode
  readonly feed: ReactNode
  readonly categories: ReactNode
  readonly latest: ReactNode
}

export function OverviewLayout({ busy, feedVersion, tiles, chart, feed, categories, latest }: OverviewLayoutProps) {
  const id = useId()

  return (
    <div className={styles.root} data-feed-version={feedVersion}>
      <section aria-labelledby={`${id}-balances`} aria-busy={busy}>
        <h2 id={`${id}-balances`} className="visually-hidden">Balances</h2>
        <div className={styles.tiles}>{tiles}</div>
      </section>
      <div className={styles.flow}>
        <section className={styles.chart} aria-labelledby={`${id}-flow`} aria-busy={busy}>
          <h2 id={`${id}-flow`}>Cash flow</h2>
          {chart}
        </section>
        <div className={styles.feed}>{feed}</div>
      </div>
      <div className={styles.band} aria-busy={busy}>
        <section className={styles.column} aria-labelledby={`${id}-categories`}>
          <h2 id={`${id}-categories`}>Top categories this month</h2>
          {categories}
        </section>
        <section className={styles.column} aria-labelledby={`${id}-latest`}>
          <h2 id={`${id}-latest`}>Latest activity</h2>
          {latest}
        </section>
      </div>
    </div>
  )
}

export function useScopeCount(): number {
  const { location } = useRoute()
  return parseFilter(location.search).account === null ? ACCOUNTS.length : 1
}

export function TileSkeletons({ count }: { readonly count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} className={cx(styles.tileSkeleton, styles.fill)}>
      <Skeleton />
    </div>
  ))
}

export function ChartSkeleton() {
  return (
    <div className={styles.chartSkeleton} data-chart-skeleton="">
      <div className={styles.skeletonLine}><Skeleton /></div>
      <div className={cx(styles.skeletonLine, styles.skeletonSummary)}><Skeleton variant="text" lines={2} /></div>
      <div className={cx(styles.skeletonPlot, styles.fill)}><Skeleton /></div>
      <div className={styles.skeletonLine}><Skeleton /></div>
    </div>
  )
}

export function CategoriesSkeleton() {
  return (
    <div className={cx(styles.categoriesSkeleton, styles.fill)}>
      <Skeleton />
    </div>
  )
}

export function LatestSkeleton() {
  return (
    <div className={cx(styles.latestSkeleton, styles.fill)}>
      <Skeleton />
    </div>
  )
}

export function FeedSkeleton() {
  return (
    <div className={styles.fill}>
      <Skeleton />
    </div>
  )
}

export function OverviewSkeleton() {
  const count = useScopeCount()

  return (
    <OverviewLayout
      busy
      tiles={<TileSkeletons count={count} />}
      chart={<ChartSkeleton />}
      feed={<FeedSkeleton />}
      categories={<CategoriesSkeleton />}
      latest={<LatestSkeleton />}
    />
  )
}
