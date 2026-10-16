import { lazy, Suspense } from 'react'

import { Skeleton } from '../ui/Skeleton/Skeleton'

const OverviewContent = lazy(async () => {
  const { OverviewContent: content } = await import('./overview/content')
  return { default: content }
})

export function OverviewPage() {
  return (
    <>
      <h1 tabIndex={-1}>Overview</h1>
      <p>Balances, cash flow and the latest activity across your accounts will appear here.</p>
      <Suspense fallback={<Skeleton variant="text" lines={4} />}>
        <OverviewContent />
      </Suspense>
    </>
  )
}
