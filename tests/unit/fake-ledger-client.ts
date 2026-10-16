import type { FilterState } from '../../src/state/url'
import type { LedgerClient } from '../../src/worker/client'
import type { LedgerResult } from '../../src/worker/protocol'

export interface PendingQuery {
  readonly filter: FilterState
  readonly channel: string
  readonly resolve: (result: LedgerResult | null) => void
  readonly reject: (reason: Error) => void
  settled: boolean
}

export interface FakeLedgerClient {
  readonly client: LedgerClient
  readonly calls: PendingQuery[]
}

export function fakeClient({ supersede = true }: { readonly supersede?: boolean } = {}): FakeLedgerClient {
  const calls: PendingQuery[] = []
  const client: LedgerClient = {
    query: (filter, channel) => {
      for (const earlier of calls) {
        if (supersede && earlier.channel === channel && !earlier.settled) {
          earlier.settled = true
          earlier.resolve(null)
        }
      }
      return new Promise((resolve, reject) => {
        calls.push({ filter, channel, resolve, reject, settled: false })
      })
    },
    history: () => Promise.resolve(new Int32Array(0)),
    series: () => Promise.reject(new Error('Series is not used here.')),
    setEdits: () => undefined,
    ready: () => Promise.resolve(),
    terminate: () => undefined,
  }
  return { client, calls }
}

export const sharedLedgerClient = fakeClient()
