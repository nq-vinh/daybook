import { lazy, Suspense } from 'react'

import { Skeleton } from '../ui/Skeleton/Skeleton'

const BudgetsContent = lazy(async () => {
  const { BudgetsContent: content } = await import('./budgets/content')
  return { default: content }
})

export function BudgetsPage() {
  return (
    <>
      <h1 tabIndex={-1}>Budgets</h1>
      <Suspense fallback={<Skeleton variant="text" lines={6} />}>
        <BudgetsContent />
      </Suspense>
    </>
  )
}
