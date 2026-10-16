import { lazy, Suspense } from 'react'

import { TRANSACTION_COUNT } from '../domain/world'
import type { Params } from '../router/match'
import { Skeleton } from '../ui/Skeleton/Skeleton'

const TransactionContent = lazy(async () => {
  const { TransactionContent: content } = await import('./transaction/content')
  return { default: content }
})

export function parseTransactionId(raw: string | undefined): number | null {
  if (raw === undefined || !/^(0|[1-9]\d{0,5})$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return id < TRANSACTION_COUNT ? id : null
}

export function acceptsTransactionPath(params: Params, pathname: string): boolean {
  return !pathname.includes('%') && parseTransactionId(params.id) !== null
}

export function TransactionPage({ params }: { readonly params: Params }) {
  const id = parseTransactionId(params.id)

  if (id === null) {
    throw new Error(`The router matched an invalid transaction id: ${params.id ?? ''}`)
  }

  return (
    <>
      <h1 tabIndex={-1}>Transaction</h1>
      <Suspense fallback={<Skeleton variant="text" lines={8} />}>
        <TransactionContent key={id} id={id} />
      </Suspense>
    </>
  )
}
