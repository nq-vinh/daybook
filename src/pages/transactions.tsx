import { lazy, Suspense } from 'react'

import { Skeleton } from '../ui/Skeleton/Skeleton'

const LedgerContent = lazy(async () => {
  const { LedgerContent: content } = await import('./transactions/content')
  return { default: content }
})

export function TransactionsPage() {
  return (
    <>
      <h1 tabIndex={-1}>Transactions</h1>
      <Suspense fallback={<Skeleton variant="text" lines={8} />}>
        <LedgerContent />
      </Suspense>
    </>
  )
}
