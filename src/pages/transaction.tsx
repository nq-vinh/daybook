import type { Params } from '../router/match'

export function TransactionPage({ params }: { readonly params: Params }) {
  return (
    <>
      <h1 tabIndex={-1}>Transaction</h1>
      <p>Details for transaction {params.id} will appear here.</p>
    </>
  )
}
