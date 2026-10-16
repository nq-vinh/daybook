import { afterEach, describe, expect, it } from 'vitest'

import { transaction } from '../domain/transactions'
import { setCategory } from '../state/edits'
import { DEFAULT_FILTER } from '../state/url'
import { createLedgerClient, forwardCategoryEdits, type LedgerClient, type LedgerWorkerHandlers } from './client'
import type { CategoryEdit, LedgerRequest, LedgerSeries, LedgerTotals } from './protocol'

interface FakeWorker {
  readonly posted: LedgerRequest[]
  terminated: boolean
}

function harness() {
  const workers: FakeWorker[] = []
  let handlers: LedgerWorkerHandlers | null = null
  const client = createLedgerClient((next) => {
    handlers = next
    const worker: FakeWorker = { posted: [], terminated: false }
    workers.push(worker)
    return {
      post(request) {
        worker.posted.push(request)
      },
      terminate() {
        worker.terminated = true
      },
    }
  })

  function current(): LedgerWorkerHandlers {
    if (handlers === null) {
      throw new Error('No worker was spawned.')
    }
    return handlers
  }

  function requestIds(type: LedgerRequest['type']): number[] {
    return (workers.at(-1)?.posted ?? []).flatMap((request) => (request.type === type && 'requestId' in request ? [request.requestId] : []))
  }

  return { client, workers, current, requestIds }
}

const TOTALS: LedgerTotals = { count: 2, debits: 10, credits: 30, net: 20, currency: 'EUR' }

describe('ledger client', () => {
  it('spawns no worker until the first request and resolves ready on the ready message', async () => {
    const { client, workers, current } = harness()
    expect(workers).toHaveLength(0)

    const ready = client.ready()
    expect(workers).toHaveLength(1)
    current().message({ type: 'ready' })

    await expect(ready).resolves.toBeUndefined()
  })

  it('resolves a query with the ids and totals of its own response', async () => {
    const { client, current, requestIds } = harness()
    const result = client.query(DEFAULT_FILTER, 'ledger')
    const [requestId = -1] = requestIds('query')
    const ids = new Int32Array([4, 2])

    current().message({ type: 'result', requestId, ids, totals: TOTALS })

    await expect(result).resolves.toEqual({ ids, totals: TOTALS })
  })

  it('resolves superseded queries with null and ignores their late responses', async () => {
    const { client, current, requestIds } = harness()
    const first = client.query(DEFAULT_FILTER, 'ledger')
    const second = client.query({ ...DEFAULT_FILTER, q: 'rent' }, 'ledger')
    const [firstId = -1, secondId = -1] = requestIds('query')

    await expect(first).resolves.toBeNull()

    current().message({ type: 'result', requestId: firstId, ids: new Int32Array([1]), totals: TOTALS })
    current().message({ type: 'result', requestId: secondId, ids: new Int32Array([7]), totals: TOTALS })

    await expect(second).resolves.toEqual({ ids: new Int32Array([7]), totals: TOTALS })
  })

  it('does not supersede history and series requests with a query', async () => {
    const { client, current, requestIds } = harness()
    const history = client.history('emp-01', 12, 5)
    const series = client.series(null)
    void client.query(DEFAULT_FILTER, 'ledger')
    const [historyId = -1] = requestIds('history')
    const [seriesId = -1] = requestIds('series')
    const months: LedgerSeries = { income: [1], expense: [2], net: [-1], monthToDate: { income: 0, expense: 0, net: 0 }, currency: 'EUR' }

    current().message({ type: 'history', requestId: historyId, ids: new Int32Array([9, 8]) })
    current().message({ type: 'series', requestId: seriesId, series: months })

    await expect(history).resolves.toEqual(new Int32Array([9, 8]))
    await expect(series).resolves.toEqual(months)
  })

  it('posts edits immediately once connected and re-sends them to a new worker', async () => {
    const { client, workers, current } = harness()
    client.setEdits([[3, 'travel']])
    expect(workers).toHaveLength(0)

    const pending = client.query(DEFAULT_FILTER, 'ledger')
    expect(workers[0]?.posted[0]).toEqual({ type: 'edits', categories: [[3, 'travel']] })

    client.setEdits([[3, 'travel'], [8, 'meals']])
    expect(workers[0]?.posted.at(-1)).toEqual({ type: 'edits', categories: [[3, 'travel'], [8, 'meals']] })

    current().error(new Error('boom'))
    await expect(pending).rejects.toThrow('boom')
    expect(workers[0]?.terminated).toBe(true)

    void client.query(DEFAULT_FILTER, 'ledger')
    expect(workers).toHaveLength(2)
    expect(workers[1]?.posted[0]).toEqual({ type: 'edits', categories: [[3, 'travel'], [8, 'meals']] })
    expect(workers[1]?.posted[1]).toMatchObject({ type: 'query' })
  })

  it('rejects every pending request and the ready promise when the worker fails', async () => {
    const { client, current } = harness()
    const ready = client.ready()
    const query = client.query(DEFAULT_FILTER, 'ledger')
    const history = client.history('emp-02', 3, 0)

    current().error(new Error('worker crashed'))

    await expect(ready).rejects.toThrow('worker crashed')
    await expect(query).rejects.toThrow('worker crashed')
    await expect(history).rejects.toThrow('worker crashed')
  })

  it('supersedes pending queries only on the same channel', async () => {
    const { client, current, requestIds } = harness()
    const ledger = client.query(DEFAULT_FILTER, 'ledger')
    const detail = client.query({ ...DEFAULT_FILTER, cat: ['rent'] }, 'detail')
    const [ledgerId = -1, detailId = -1] = requestIds('query')

    current().message({ type: 'result', requestId: detailId, ids: new Int32Array([2]), totals: TOTALS })
    current().message({ type: 'result', requestId: ledgerId, ids: new Int32Array([1]), totals: TOTALS })

    await expect(ledger).resolves.toEqual({ ids: new Int32Array([1]), totals: TOTALS })
    await expect(detail).resolves.toEqual({ ids: new Int32Array([2]), totals: TOTALS })
  })

  it('settles every pending request on terminate and spawns a new worker on the next request', async () => {
    const { client, workers } = harness()
    const ready = client.ready()
    const query = client.query(DEFAULT_FILTER, 'ledger')
    const history = client.history('emp-01', 12, 0)
    const series = client.series('acc-main')

    client.terminate()

    expect(workers[0]?.terminated).toBe(true)
    await expect(query).resolves.toBeNull()
    await expect(history).rejects.toThrow('terminated')
    await expect(series).rejects.toThrow('terminated')
    await expect(ready).rejects.toThrow('terminated')

    const next = client.query(DEFAULT_FILTER, 'ledger')
    expect(workers).toHaveLength(2)
    expect(workers[1]?.posted.at(-1)).toMatchObject({ type: 'query' })
    client.terminate()
    await expect(next).resolves.toBeNull()
  })
})

describe('forwardCategoryEdits', () => {
  const edited = 2_000
  const target = transaction(edited).category === 'travel' ? 'meals' : 'travel'

  afterEach(() => {
    setCategory(edited, null)
  })

  it('sends the current category edits and every later change until stopped', () => {
    const sent: (readonly CategoryEdit[])[] = []
    const recorder: LedgerClient = {
      query: () => Promise.resolve(null),
      history: () => Promise.resolve(new Int32Array(0)),
      series: () => Promise.reject(new Error('Series is not used here.')),
      setEdits: (categories) => {
        sent.push(categories)
      },
      ready: () => Promise.resolve(),
      terminate: () => undefined,
    }

    const stop = forwardCategoryEdits(recorder)
    expect(sent).toEqual([[]])

    setCategory(edited, target)
    expect(sent).toEqual([[], [[edited, target]]])

    stop()
    setCategory(edited, null)
    expect(sent).toHaveLength(2)
  })
})
