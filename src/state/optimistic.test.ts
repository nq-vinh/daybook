import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mulberry32 } from '../domain/prng'
import { transaction } from '../domain/transactions'
import { CATEGORIES, type CategoryId } from '../domain/world'
import { type Edits, getEdits, setCategoryEntries } from './edits'
import {
  cancelAllForTest,
  categoriesAction,
  COMMIT_LATENCY_MS,
  commitLater,
  flushForTest,
  getEffectiveCategories,
  HISTORY_LIMIT,
  release,
  subscribeEffectiveCategories,
  undo,
} from './optimistic'

const POOL = [0, 1, 2, 3, 4, 5]

interface ModelAction {
  readonly id: string
  readonly ids: readonly number[]
  readonly categoryId: CategoryId | null
  readonly commitAt: number
  committed: boolean
}

type StoreEvent =
  | { readonly kind: 'action'; readonly action: ModelAction }
  | { readonly kind: 'outside'; readonly entries: ReadonlyArray<readonly [number, CategoryId]> }

function other(id: number, offset = 1): CategoryId {
  const index = CATEGORIES.findIndex((category) => category.id === transaction(id).category)
  return CATEGORIES[(index + offset) % CATEGORIES.length]?.id ?? 'travel'
}

function write(state: Partial<Record<number, CategoryId>>, id: number, categoryId: CategoryId | null): void {
  if (categoryId === null || categoryId === transaction(id).category) {
    Reflect.deleteProperty(state, id)
  } else {
    state[id] = categoryId
  }
}

function replayStore(initial: Edits['categories'], timeline: readonly StoreEvent[]): Edits['categories'] {
  const state: Partial<Record<number, CategoryId>> = { ...initial }
  for (const event of timeline) {
    const entries = event.kind === 'outside' ? event.entries : event.action.ids.map((id) => [id, event.action.categoryId] as const)
    for (const [id, categoryId] of entries) {
      write(state, id, categoryId)
    }
  }
  return state
}

function overlay(store: Edits['categories'], actions: readonly ModelAction[]): Edits['categories'] {
  const state: Partial<Record<number, CategoryId>> = { ...store }
  for (const action of actions) {
    for (const id of action.ids) {
      write(state, id, action.categoryId)
    }
  }
  return state
}

function resetPool(): void {
  setCategoryEntries(POOL.map((id) => [id, null] as const))
}

function storedCategories(): unknown {
  const raw = window.localStorage.getItem('edits')
  return raw === null ? {} : (JSON.parse(raw) as { categories: unknown }).categories
}

beforeEach(() => {
  vi.useFakeTimers()
  cancelAllForTest()
  resetPool()
})

afterEach(() => {
  cancelAllForTest()
  resetPool()
  vi.useRealTimers()
})

describe('optimistic category edits', () => {
  it('shows a pending action at once and writes it to the store after the latency', () => {
    const target = other(1)
    commitLater(categoriesAction([1], target))

    expect(getEffectiveCategories()[1]).toBe(target)
    expect(getEdits().categories[1]).toBeUndefined()

    vi.advanceTimersByTime(COMMIT_LATENCY_MS - 1)
    expect(getEdits().categories[1]).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(getEdits().categories[1]).toBe(target)
    expect(getEffectiveCategories()).toEqual(getEdits().categories)
  })

  it('rejects an action without exactly one previous value per id', () => {
    expect(() => commitLater({ kind: 'categories', ids: [1, 2], categoryId: 'travel', previous: [[1, null]] })).toThrow(RangeError)
  })

  it('cancels a pending action on undo so nothing reaches the store', async () => {
    const before = storedCategories()
    const handle = commitLater(categoriesAction([2, 3], other(2)))

    expect(undo(handle.id)).toEqual({ restored: 2, total: 2 })
    await expect(handle.settled).resolves.toBeUndefined()
    vi.runAllTimers()

    expect(getEdits().categories).toEqual({})
    expect(storedCategories()).toEqual(before)
    expect(getEffectiveCategories()).toEqual({})
    expect(undo(handle.id)).toBeNull()
  })

  it('writes the previous values back when undo follows the commit', () => {
    setCategoryEntries([[4, other(4, 2)]])
    const handle = commitLater(categoriesAction([3, 4], other(3)))
    flushForTest()

    expect(undo(handle.id)).toEqual({ restored: 2, total: 2 })
    expect(getEdits().categories).toEqual({ 4: other(4, 2) })
    expect(getEffectiveCategories()).toEqual(getEdits().categories)
  })

  it('leaves ids a newer action touched and hands them its previous value', () => {
    const older = commitLater(categoriesAction([1, 2, 3], other(1)))
    const newer = commitLater(categoriesAction([2], other(2, 3)))
    flushForTest()

    expect(undo(older.id)).toEqual({ restored: 2, total: 3 })
    expect(getEdits().categories).toEqual({ 2: other(2, 3) })

    expect(undo(newer.id)).toEqual({ restored: 1, total: 1 })
    expect(getEdits().categories).toEqual({})
    expect(getEffectiveCategories()).toEqual(getEdits().categories)
  })

  it('counts nothing restored when the newer action on the id is still pending', () => {
    const older = commitLater(categoriesAction([1], other(1)))
    flushForTest()
    commitLater(categoriesAction([1], other(1, 2)))

    expect(undo(older.id)).toEqual({ restored: 0, total: 1 })
    expect(getEffectiveCategories()).toEqual({ 1: other(1, 2) })
    vi.runAllTimers()
    expect(getEdits().categories).toEqual({ 1: other(1, 2) })
  })

  it('counts a pending undo as restored only when the visible category returns', () => {
    const handle = commitLater(categoriesAction([1, 2], other(1)))
    setCategoryEntries([[2, other(2, 4)]])

    expect(undo(handle.id)).toEqual({ restored: 1, total: 2 })
    expect(getEffectiveCategories()).toEqual({ 2: other(2, 4) })
  })

  it('restores the outside write from the latency window after the commit but counts it as kept', () => {
    const outside = other(1, 4)
    const handle = commitLater(categoriesAction([1], other(1)))
    setCategoryEntries([[1, outside]])
    flushForTest()
    expect(getEdits().categories).toEqual({ 1: other(1) })

    expect(undo(handle.id)).toEqual({ restored: 0, total: 1 })
    expect(getEdits().categories).toEqual({ 1: outside })
    expect(getEffectiveCategories()).toEqual(getEdits().categories)
  })

  it('releases the oldest actions of a burst until at most the history limit stay undoable, and still commits them', () => {
    const extra = 60 - HISTORY_LIMIT
    const handles = Array.from({ length: 60 }, (_, index) => (
      commitLater(categoriesAction([index < extra ? 3 : 2], other(index < extra ? 3 : 2, (index % 3) + 1)))
    ))

    expect(handles.slice(0, extra).map((handle) => undo(handle.id))).toEqual(Array.from({ length: extra }, () => null))
    vi.runAllTimers()
    expect(getEdits().categories).toEqual({ 2: other(2, (59 % 3) + 1), 3: other(3, ((extra - 1) % 3) + 1) })
    expect(undo(handles[extra]?.id ?? '')).not.toBeNull()
  })

  it('skips ids changed outside the layer since the commit', () => {
    const handle = commitLater(categoriesAction([1, 2, 3], other(1)))
    flushForTest()
    setCategoryEntries([[2, other(2, 4)]])

    expect(undo(handle.id)).toEqual({ restored: 2, total: 3 })
    expect(getEdits().categories).toEqual({ 2: other(2, 4) })
  })

  it('hands nothing over to a newer action layered on an outside change', () => {
    const outside = other(1, 4)
    const earlier = commitLater(categoriesAction([1], other(1)))
    flushForTest()
    setCategoryEntries([[1, outside]])
    const later = commitLater(categoriesAction([1], other(1, 2)))
    flushForTest()

    expect(undo(earlier.id)).toEqual({ restored: 0, total: 1 })
    expect(getEdits().categories).toEqual({ 1: other(1, 2) })
    expect(undo(later.id)).toEqual({ restored: 1, total: 1 })
    expect(getEdits().categories).toEqual({ 1: outside })
  })

  it('stops offering undo once an action is released and keeps at most the history limit', () => {
    const released = commitLater(categoriesAction([1], other(1)))
    flushForTest()
    release(released.id)
    expect(undo(released.id)).toBeNull()
    expect(getEdits().categories).toEqual({ 1: other(1) })

    const handles = Array.from({ length: HISTORY_LIMIT + 1 }, (_, index) => commitLater(categoriesAction([2], other(2, (index % 3) + 1))))
    flushForTest()
    expect(undo(handles[0]?.id ?? '')).toBeNull()
    expect(undo(handles[1]?.id ?? '')).not.toBeNull()
  })

  it('changes the merged snapshot once when the action starts and keeps it when the commit lands', () => {
    const listener = vi.fn()
    const stop = subscribeEffectiveCategories(listener)
    const before = getEffectiveCategories()

    commitLater(categoriesAction([5], other(5)))
    const started = getEffectiveCategories()
    vi.runAllTimers()

    expect(started).not.toBe(before)
    expect(getEffectiveCategories()).toBe(started)
    expect(listener).toHaveBeenCalled()
    stop()
  })

  it('keeps both stores equal to a replay of the surviving actions and outside writes for seeded sequences', () => {
    const actionValues: ReadonlyArray<CategoryId | null> = [
      null,
      ...POOL.map((id) => transaction(id).category),
      ...POOL.slice(0, 3).map((id) => other(id)),
    ]
    const outsideValues = CATEGORIES.map((category) => category.id).filter((id) => !actionValues.includes(id))
    expect(outsideValues.length).toBeGreaterThan(0)

    for (let seed = 1; seed <= 150; seed += 1) {
      cancelAllForTest()
      resetPool()
      const random = mulberry32(seed)
      const pick = <T,>(items: readonly T[]): T => {
        const item = items[Math.floor(random() * items.length)]
        if (item === undefined) {
          throw new Error('Expected a non-empty list.')
        }
        return item
      }
      setCategoryEntries([[pick(POOL), pick(outsideValues)]])
      const initial = getEdits().categories
      const timeline: StoreEvent[] = []
      const undone: string[] = []
      let surviving: ModelAction[] = []
      let now = 0

      for (let step = 0; step < 40; step += 1) {
        const roll = random()
        if (roll < 0.4) {
          const chosen = POOL.filter(() => random() < 0.4)
          const ids = chosen.length === 0 ? [pick(POOL)] : chosen
          const categoryId = pick(actionValues)
          const { id } = commitLater(categoriesAction(ids, categoryId))
          surviving.push({ id, ids, categoryId, commitAt: now + COMMIT_LATENCY_MS, committed: false })
        } else if (roll < 0.7) {
          const elapsed = Math.floor(random() * 2.5 * COMMIT_LATENCY_MS)
          now += elapsed
          for (const action of surviving) {
            if (!action.committed && action.commitAt <= now) {
              action.committed = true
              timeline.push({ kind: 'action', action })
            }
          }
          vi.advanceTimersByTime(elapsed)
        } else if (roll < 0.78) {
          const entries = POOL.filter(() => random() < 0.3).map((id) => [id, pick(outsideValues)] as const)
          setCategoryEntries(entries)
          timeline.push({ kind: 'outside', entries })
        } else if (surviving.length > 0) {
          const target = pick(surviving)
          expect(undo(target.id)).not.toBeNull()
          surviving = surviving.filter((action) => action !== target)
          const index = timeline.findIndex((event) => event.kind === 'action' && event.action === target)
          if (index !== -1) {
            timeline.splice(index, 1)
          }
          undone.push(target.id)
        } else if (undone.length > 0) {
          expect(undo(pick(undone))).toBeNull()
        }

        const store = replayStore(initial, timeline)
        expect(getEdits().categories).toEqual(store)
        expect(getEffectiveCategories()).toEqual(overlay(store, surviving.filter((action) => !action.committed)))
      }

      vi.runAllTimers()
      for (const action of surviving.filter((candidate) => !candidate.committed)) {
        action.committed = true
        timeline.push({ kind: 'action', action })
      }
      expect(getEdits().categories).toEqual(replayStore(initial, timeline))
      expect(getEffectiveCategories()).toEqual(getEdits().categories)
      expect(storedCategories()).toEqual(getEdits().categories)
    }
  })
})
