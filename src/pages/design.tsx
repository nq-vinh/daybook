import { lazy, Suspense } from 'react'

import { Skeleton } from '../ui/Skeleton/Skeleton'

const DesignContent = lazy(async () => {
  const { DesignContent: content } = await import('./design/content')
  return { default: content }
})

export function DesignPage() {
  return (
    <>
      <h1 tabIndex={-1}>Design system</h1>
      <p>
        This page shows the tokens and components the app is built from, read from the running stylesheet rather than copied from a
        document. Colours are resolved in the current theme and their contrast is measured in your browser, sizes and durations are read
        back at this viewport, and each component appears in the states it owns with the keys it answers to.
      </p>
      <Suspense fallback={<Skeleton variant="text" lines={8} />}>
        <DesignContent />
      </Suspense>
    </>
  )
}
