import type { AccountId, CounterpartyId } from '../domain/world'
import { categoryEditEntries, type Edits, getEdits, subscribeEdits } from '../state/edits'
import { getEvents, settlements, subscribeEvents } from '../state/feed'
import type { FilterState } from '../state/url'
import {
  assertNever,
  type BudgetSpend,
  type CardSpend,
  type CategoryEdit,
  type FeedSettlement,
  type LedgerRequest,
  type LedgerResponse,
  type LedgerResult,
  type LedgerSeries,
} from './protocol'

export interface LedgerWorker {
  post(request: LedgerRequest): void
  terminate(): void
}

export interface LedgerWorkerHandlers {
  message(response: LedgerResponse): void
  error(reason: Error): void
}

export type LedgerWorkerFactory = (handlers: LedgerWorkerHandlers) => LedgerWorker

export interface LedgerClient {
  query(filter: FilterState, channel: string): Promise<LedgerResult | null>
  history(counterpartyId: CounterpartyId, limit: number, exclude: number): Promise<Int32Array<ArrayBuffer>>
  series(accountId: AccountId | null): Promise<LedgerSeries>
  cards(): Promise<readonly CardSpend[]>
  budgets(): Promise<readonly BudgetSpend[]>
  setEdits(categories: readonly CategoryEdit[]): void
  setFeed(settled: readonly FeedSettlement[]): void
  ready(): Promise<void>
  terminate(): void
}

type Pending =
  | {
    readonly kind: 'query'
    readonly channel: string
    readonly resolve: (result: LedgerResult | null) => void
    readonly reject: (reason: Error) => void
  }
  | { readonly kind: 'history'; readonly resolve: (ids: Int32Array<ArrayBuffer>) => void; readonly reject: (reason: Error) => void }
  | { readonly kind: 'series'; readonly resolve: (series: LedgerSeries) => void; readonly reject: (reason: Error) => void }
  | { readonly kind: 'cards'; readonly resolve: (cards: readonly CardSpend[]) => void; readonly reject: (reason: Error) => void }
  | { readonly kind: 'budgets'; readonly resolve: (budgets: readonly BudgetSpend[]) => void; readonly reject: (reason: Error) => void }

interface Connection {
  readonly worker: LedgerWorker
  readonly ready: Promise<void>
  readonly resolveReady: () => void
  readonly rejectReady: (reason: Error) => void
}

export function createLedgerClient(spawn: LedgerWorkerFactory): LedgerClient {
  const pending = new Map<number, Pending>()
  let connection: Connection | null = null
  let edits: readonly CategoryEdit[] = []
  let feed: readonly FeedSettlement[] = []
  let nextRequestId = 1

  function stop(reason: Error, supersedeQueries: boolean): void {
    const stopped = connection
    connection = null
    stopped?.rejectReady(reason)
    stopped?.worker.terminate()
    const settled = [...pending.values()]
    pending.clear()
    for (const request of settled) {
      if (supersedeQueries && request.kind === 'query') {
        request.resolve(null)
      } else {
        request.reject(reason)
      }
    }
  }

  function fail(reason: Error): void {
    stop(reason, false)
  }

  function settle(requestId: number, kind: Pending['kind']): Pending | null {
    const request = pending.get(requestId)
    if (request?.kind !== kind) {
      return null
    }
    pending.delete(requestId)
    return request
  }

  function receive(response: LedgerResponse): void {
    switch (response.type) {
      case 'ready':
        connection?.resolveReady()
        return
      case 'result': {
        const request = settle(response.requestId, 'query')
        if (request?.kind === 'query') {
          request.resolve({ ids: response.ids, totals: response.totals })
        }
        return
      }
      case 'history': {
        const request = settle(response.requestId, 'history')
        if (request?.kind === 'history') {
          request.resolve(response.ids)
        }
        return
      }
      case 'series': {
        const request = settle(response.requestId, 'series')
        if (request?.kind === 'series') {
          request.resolve(response.series)
        }
        return
      }
      case 'cards': {
        const request = settle(response.requestId, 'cards')
        if (request?.kind === 'cards') {
          request.resolve(response.cards)
        }
        return
      }
      case 'budgets': {
        const request = settle(response.requestId, 'budgets')
        if (request?.kind === 'budgets') {
          request.resolve(response.budgets)
        }
        return
      }
      default:
        assertNever(response)
    }
  }

  function connect(): Connection {
    if (connection !== null) {
      return connection
    }
    let resolveReady: () => void = () => undefined
    let rejectReady: (reason: Error) => void = () => undefined
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    ready.catch(() => undefined)
    const worker = spawn({ message: receive, error: fail })
    connection = { worker, ready, resolveReady, rejectReady }
    if (edits.length > 0) {
      worker.post({ type: 'edits', categories: edits })
    }
    if (feed.length > 0) {
      worker.post({ type: 'feed', settled: feed })
    }
    return connection
  }

  function register(entry: Pending): number {
    const requestId = nextRequestId
    nextRequestId += 1
    pending.set(requestId, entry)
    return requestId
  }

  function supersedeQueries(channel: string): void {
    for (const [requestId, superseded] of pending) {
      if (superseded.kind === 'query' && superseded.channel === channel) {
        pending.delete(requestId)
        superseded.resolve(null)
      }
    }
  }

  return {
    query(filter, channel) {
      supersedeQueries(channel)
      return new Promise((resolve, reject) => {
        const { worker } = connect()
        const requestId = register({ kind: 'query', channel, resolve, reject })
        worker.post({ type: 'query', requestId, filter })
      })
    },
    history(counterpartyId, limit, exclude) {
      return new Promise((resolve, reject) => {
        const { worker } = connect()
        const requestId = register({ kind: 'history', resolve, reject })
        worker.post({ type: 'history', requestId, counterpartyId, limit, exclude })
      })
    },
    series(accountId) {
      return new Promise((resolve, reject) => {
        const { worker } = connect()
        const requestId = register({ kind: 'series', resolve, reject })
        worker.post({ type: 'series', requestId, accountId })
      })
    },
    cards() {
      return new Promise((resolve, reject) => {
        const { worker } = connect()
        const requestId = register({ kind: 'cards', resolve, reject })
        worker.post({ type: 'cards', requestId })
      })
    },
    budgets() {
      return new Promise((resolve, reject) => {
        const { worker } = connect()
        const requestId = register({ kind: 'budgets', resolve, reject })
        worker.post({ type: 'budgets', requestId })
      })
    },
    setEdits(categories) {
      edits = categories
      connection?.worker.post({ type: 'edits', categories })
    },
    setFeed(settled) {
      feed = settled
      connection?.worker.post({ type: 'feed', settled })
    },
    ready() {
      return connect().ready
    },
    terminate() {
      stop(new Error('The ledger worker was terminated.'), true)
    },
  }
}

function spawnLedgerWorker(handlers: LedgerWorkerHandlers): LedgerWorker {
  const worker = new Worker(new URL('./ledger.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<LedgerResponse>) => {
    handlers.message(event.data)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    handlers.error(new Error(event.message === '' ? 'The ledger worker failed.' : event.message))
  }
  worker.onmessageerror = () => {
    handlers.error(new Error('A ledger worker message could not be deserialised.'))
  }
  return {
    post(request) {
      worker.postMessage(request)
    },
    terminate() {
      worker.terminate()
    },
  }
}

export const ledgerClient = createLedgerClient(spawnLedgerWorker)

export function forwardCategoryEdits(client: LedgerClient): () => void {
  let forwarded: Edits['categories'] | null = null

  function forward(): void {
    const { categories } = getEdits()
    if (categories !== forwarded) {
      forwarded = categories
      client.setEdits(categoryEditEntries(categories))
    }
  }

  forward()
  return subscribeEdits(forward)
}

export function forwardFeed(client: LedgerClient): () => void {
  let forwarded: ReturnType<typeof getEvents> | null = null

  function forward(): void {
    const events = getEvents()
    if (events !== forwarded) {
      forwarded = events
      client.setFeed(settlements(events))
    }
  }

  forward()
  return subscribeEvents(forward)
}

const stopForwarding = forwardCategoryEdits(ledgerClient)
const stopForwardingFeed = forwardFeed(ledgerClient)

import.meta.hot?.dispose(() => {
  stopForwarding()
  stopForwardingFeed()
  ledgerClient.terminate()
})
