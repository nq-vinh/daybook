import { act, renderHook } from '@testing-library/react'
import { Component, createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { transaction } from '../domain/transactions'
import type { LedgerClient } from '../worker/client'
import type { LedgerResult } from '../worker/protocol'
import { setCategory, setNote } from './edits'
import { useLedgerQuery } from './query'
import { DEFAULT_FILTER, type FilterState } from './url'

interface PendingQuery {
  readonly filter: FilterState
  readonly channel: string
  readonly resolve: (result: LedgerResult | null) => void
  readonly reject: (reason: Error) => void
  settled: boolean
}

function fakeClient({ supersede = true }: { readonly supersede?: boolean } = {}): { client: LedgerClient; calls: PendingQuery[] } {
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

function result(...ids: number[]): LedgerResult {
  return { ids: new Int32Array(ids), totals: { count: ids.length, debits: 0, credits: 0, net: 0, currency: 'EUR' } }
}

async function respond(call: PendingQuery | undefined, value: LedgerResult | Error): Promise<void> {
  if (call === undefined) {
    throw new Error('Expected a posted query.')
  }
  await act(async () => {
    call.settled = true
    if (value instanceof Error) {
      call.reject(value)
    } else {
      call.resolve(value)
    }
    await Promise.resolve()
  })
}

class Boundary extends Component<{ readonly children?: ReactNode; readonly onError: (error: Error) => void }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: Error): void {
    this.props.onError(error)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLedgerQuery', () => {
  it('posts the canonical filter and exposes the landed result', async () => {
    const { client, calls } = fakeClient()
    const { result: hook } = renderHook(() => useLedgerQuery({ ...DEFAULT_FILTER, cat: ['travel', 'meals', 'travel'] }, client))

    expect(hook.current).toMatchObject({ isReady: false, isStale: true })
    expect(hook.current.ids).toHaveLength(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.filter.cat).toEqual(['meals', 'travel'])

    await respond(calls[0], result(3, 1, 2))

    expect(hook.current.isReady).toBe(true)
    expect(hook.current.isStale).toBe(false)
    expect([...hook.current.ids]).toEqual([3, 1, 2])
    expect(hook.current.totals.count).toBe(3)
  })

  it('keeps the previous result while the next one is pending', async () => {
    const { client, calls } = fakeClient()
    const { result: hook, rerender } = renderHook(({ filter }) => useLedgerQuery(filter, client), {
      initialProps: { filter: DEFAULT_FILTER },
    })
    await respond(calls[0], result(1, 2))

    rerender({ filter: { ...DEFAULT_FILTER, status: ['pending'] } })

    expect(calls).toHaveLength(2)
    expect([...hook.current.ids]).toEqual([1, 2])
    expect(hook.current.isStale).toBe(true)

    await respond(calls[1], result(2))
    expect([...hook.current.ids]).toEqual([2])
    expect(hook.current.isStale).toBe(false)
  })

  it('lands only the settled value of a keystroke sequence and drops out-of-order responses', async () => {
    const { client, calls } = fakeClient({ supersede: false })
    const landed: Int32Array[] = []
    const { result: hook, rerender } = renderHook(({ q }) => {
      const query = useLedgerQuery({ ...DEFAULT_FILTER, q }, client)
      if (landed.at(-1) !== query.ids) {
        landed.push(query.ids)
      }
      return query
    }, { initialProps: { q: '' } })
    await respond(calls[0], result(1, 2, 3))

    for (const q of ['i', 'in', 'inv']) {
      rerender({ q })
    }
    const keystrokes = calls.slice(1)
    expect(keystrokes).toHaveLength(3)
    expect(keystrokes.at(-1)?.filter.q).toBe('inv')

    await respond(keystrokes.at(-1), result(3))
    for (const stale of keystrokes.slice(0, -1).reverse()) {
      await respond(stale, result(9, 9))
    }

    expect([...hook.current.ids]).toEqual([3])
    expect(hook.current.isStale).toBe(false)
    expect(landed.map((ids) => [...ids])).toEqual([[], [1, 2, 3], [3]])
  })

  it('posts twice under StrictMode and lands only the second response', async () => {
    const { client, calls } = fakeClient()
    const { result: hook } = renderHook(() => useLedgerQuery(DEFAULT_FILTER, client), { reactStrictMode: true })

    expect(calls).toHaveLength(2)
    expect(calls[1]?.channel).toBe(calls[0]?.channel)
    expect(calls[0]?.settled).toBe(true)

    await respond(calls[1], result(5))

    expect([...hook.current.ids]).toEqual([5])
    expect(hook.current.isReady).toBe(true)
  })

  it('re-posts the query when a category edit changes', async () => {
    const { client, calls } = fakeClient()
    renderHook(() => useLedgerQuery({ ...DEFAULT_FILTER, cat: ['travel'] }, client))
    await respond(calls[0], result(1))
    const id = 3_000
    const target = transaction(id).category === 'travel' ? 'meals' : 'travel'

    act(() => {
      setCategory(id, target)
    })
    expect(calls).toHaveLength(2)
    expect(calls[1]?.filter.cat).toEqual(['travel'])

    act(() => {
      setCategory(id, null)
    })
    expect(calls).toHaveLength(3)

    act(() => {
      setNote(id, 'Not a category edit')
    })
    expect(calls).toHaveLength(3)

    act(() => {
      setNote(id, '')
    })
  })

  it('re-throws a failed query for the nearest error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client, calls } = fakeClient()
    const caught: Error[] = []
    renderHook(() => useLedgerQuery(DEFAULT_FILTER, client), {
      wrapper: ({ children }) => createElement(Boundary, { onError: (error) => { caught.push(error) } }, children),
    })

    await respond(calls[0], new Error('worker crashed'))

    expect(caught.map((error) => error.message)).toEqual(['worker crashed'])
  })

  it('sets no state when a response lands after unmount', async () => {
    const errors = vi.spyOn(console, 'error')
    const { client, calls } = fakeClient()
    let renders = 0
    const { unmount } = renderHook(() => {
      renders += 1
      return useLedgerQuery(DEFAULT_FILTER, client)
    })
    const rendersBeforeUnmount = renders

    unmount()
    await respond(calls[0], result(1))

    expect(renders).toBe(rendersBeforeUnmount)
    expect(errors).not.toHaveBeenCalled()
  })

  it('ignores a superseded response', async () => {
    const { client, calls } = fakeClient()
    const { result: hook } = renderHook(() => useLedgerQuery(DEFAULT_FILTER, client))

    await act(async () => {
      calls[0]?.resolve(null)
      await Promise.resolve()
    })

    expect(hook.current.isReady).toBe(false)
    expect(hook.current.isStale).toBe(true)
  })
})
