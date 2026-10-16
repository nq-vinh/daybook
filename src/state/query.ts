import { useDeferredValue, useEffect, useId, useState, useSyncExternalStore } from 'react'

import { type LedgerClient, ledgerClient } from '../worker/client'
import type { LedgerTotals } from '../worker/protocol'
import { type Edits, getEdits, subscribeEdits } from './edits'
import { type FilterState, parseFilter, serializeFilter } from './url'

export interface LedgerQuery {
  readonly ids: Int32Array
  readonly totals: LedgerTotals
  readonly isStale: boolean
  readonly isReady: boolean
}

interface LandedResult {
  readonly search: string
  readonly ids: Int32Array
  readonly totals: LedgerTotals
}

const EMPTY_IDS = new Int32Array(0)

const EMPTY_TOTALS: LedgerTotals = Object.freeze({ count: 0, debits: 0, credits: 0, net: 0, currency: 'EUR' })

function getCategoryEdits(): Edits['categories'] {
  return getEdits().categories
}

export function useLedgerQuery(filter: FilterState, client: LedgerClient = ledgerClient): LedgerQuery {
  const search = serializeFilter(filter)
  const deferredSearch = useDeferredValue(search)
  const categoryEdits = useSyncExternalStore(subscribeEdits, getCategoryEdits)
  const channel = useId()
  const [landed, setLanded] = useState<LandedResult | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)

  useEffect(() => {
    let current = true

    client.query(parseFilter(deferredSearch), channel).then(
      (result) => {
        if (current && result !== null) {
          setLanded({ search: deferredSearch, ids: result.ids, totals: result.totals })
          setFailure(null)
        }
      },
      (reason: unknown) => {
        if (current) {
          setFailure(reason instanceof Error ? reason : new Error('The ledger query failed.'))
        }
      },
    )

    return () => {
      current = false
    }
  }, [categoryEdits, channel, client, deferredSearch])

  if (failure !== null) {
    throw failure
  }

  return {
    ids: landed?.ids ?? EMPTY_IDS,
    totals: landed?.totals ?? EMPTY_TOTALS,
    isStale: landed === null || landed.search !== search || deferredSearch !== search,
    isReady: landed !== null,
  }
}
