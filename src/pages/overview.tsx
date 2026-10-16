import { lazy, Suspense } from 'react'

import { OverviewSkeleton } from './overview/layout'

const OverviewContent = lazy(async () => {
  const { OverviewContent: content } = await import('./overview/content')
  return { default: content }
})

export function OverviewPage() {
  return (
    <>
      <h1 tabIndex={-1}>Overview</h1>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </>
  )
}
