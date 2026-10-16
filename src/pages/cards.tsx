import { lazy, Suspense } from 'react'

import { Skeleton } from '../ui/Skeleton/Skeleton'

const CardsContent = lazy(async () => {
  const { CardsContent: content } = await import('./cards/content')
  return { default: content }
})

export function CardsPage() {
  return (
    <>
      <h1 tabIndex={-1}>Cards</h1>
      <Suspense fallback={<Skeleton variant="text" lines={6} />}>
        <CardsContent />
      </Suspense>
    </>
  )
}
