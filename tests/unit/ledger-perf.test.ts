// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { DEFAULT_FILTER, type FilterState } from '../../src/state/url'
import { buildLedgerIndex, type LedgerIndex, queryLedger } from '../../src/worker/index'

const QUERIES: ReadonlyArray<readonly [string, FilterState]> = [
  ['default sort, no filter', DEFAULT_FILTER],
  ['q "invoice" and one category', { ...DEFAULT_FILTER, q: 'invoice', cat: ['professional'] }],
  ['amount ascending, first use of its order', { ...DEFAULT_FILTER, sort: { column: 'amount', dir: 'asc' } }],
  ['account, date range and amount range', { ...DEFAULT_FILTER, account: 'acc-main', from: '2025-01-01', to: '2025-12-31', min: 5_000, max: 500_000 }],
]

function typedArrayBytes(index: LedgerIndex): number {
  const columns = [
    index.bookedAt,
    index.amount,
    index.amountInEur,
    index.amountInAccount,
    index.account,
    index.card,
    index.counterparty,
    index.currency,
    index.status,
    index.category,
    index.originalCategory,
    index.scratch,
  ]
  const orders = [...index.orders.values()].flatMap((order) => (
    ArrayBuffer.isView(order.keys) && !columns.some((column) => column === order.keys) ? [order.ids, order.keys] : [order.ids]
  ))
  return [...columns, ...orders].reduce((sum, column) => sum + column.byteLength, 0)
}

function timed<T>(run: () => T): [T, number] {
  const started = performance.now()
  const result = run()
  return [result, performance.now() - started]
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

describe('ledger performance', () => {
  it('builds the 100k index and answers representative queries within budget', () => {
    const [index, buildMs] = timed(() => buildLedgerIndex())
    const lines = [`build ${buildMs.toFixed(0)} ms, columns ${String(typedArrayBytes(index))} bytes`]

    for (const [label, filter] of QUERIES) {
      const [first, coldMs] = timed(() => queryLedger(index, filter))
      const warm = Array.from({ length: 7 }, () => timed(() => queryLedger(index, filter))[1])
      lines.push(`${label}: ${String(first.ids.length)} rows, cold ${coldMs.toFixed(1)} ms, warm median ${median(warm).toFixed(1)} ms`)
      expect(first.ids.length).toBeGreaterThan(0)
      expect(coldMs).toBeLessThan(200)
      expect(Math.max(...warm)).toBeLessThan(200)
    }

    lines.push(`typed arrays with the bookedAt and amount orders cached ${String(typedArrayBytes(index))} bytes`)
    lines.push(`haystack ${String(index.haystack.reduce((sum, text) => sum + text.length, 0))} characters`)
    console.info(lines.join('\n'))
    expect(buildMs).toBeLessThan(2_000)
  })
})
