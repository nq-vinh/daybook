import { startTransition, useDeferredValue, useEffect, useId, useState, useSyncExternalStore } from 'react'

import { type LedgerClient, ledgerClient } from '../worker/client'
import type { LedgerTotals } from '../worker/protocol'
import { type Edits, getEdits, subscribeEdits } from './edits'
import { getEvents, subscribeEvents } from './feed'
import { type FilterState, parseFilter, serializeFilter } from './url'

export interface LedgerQuery {
  readonly ids: Int32Array
  readonly totals: LedgerTotals
  readonly isStale: boolean
  readonly isReady: boolean
  readonly search: string | null
}

interface LandedResult {
  readonly search: string
  readonly categoryEdits: Edits['categories']
  readonly ids: Int32Array
  readonly totals: LedgerTotals
}

const EMPTY_IDS = new Int32Array(0)

const EMPTY_TOTALS: LedgerTotals = Object.freeze({ count: 0, debits: 0, credits: 0, net: 0, currency: 'EUR' })

function sameIds(previous: Int32Array, next: Int32Array): boolean {
  if (previous.length !== next.length) {
    return false
  }
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false
    }
  }
  return true
}

function getCategoryEdits(): Edits['categories'] {
  return getEdits().categories
}

export function useLedgerQuery(filter: FilterState, client: LedgerClient = ledgerClient): LedgerQuery {
  const search = serializeFilter(filter)
  const deferredSearch = useDeferredValue(search)
  const categoryEdits = useSyncExternalStore(subscribeEdits, getCategoryEdits)
  const feedEvents = useSyncExternalStore(subscribeEvents, getEvents)
  const channel = useId()
  const [landed, setLanded] = useState<LandedResult | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)

  useEffect(() => {
    let current = true

    client.query(parseFilter(deferredSearch), channel).then(
      (result) => {
        if (current && result !== null) {
          startTransition(() => {
            setLanded((previous) => ({
              search: deferredSearch,
              categoryEdits,
              ids: previous !== null && sameIds(previous.ids, result.ids) ? previous.ids : result.ids,
              totals: result.totals,
            }))
            setFailure(null)
          })
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
  }, [categoryEdits, channel, client, deferredSearch, feedEvents])

  if (failure !== null) {
    throw failure
  }

  const pending = landed === null || landed.search !== deferredSearch || landed.categoryEdits !== categoryEdits

  return {
    ids: landed?.ids ?? EMPTY_IDS,
    totals: landed?.totals ?? EMPTY_TOTALS,
    isStale: deferredSearch !== search || pending,
    isReady: landed !== null,
    search: landed?.search ?? null,
  }
}
