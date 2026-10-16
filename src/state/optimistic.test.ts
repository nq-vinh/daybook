import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mulberry32 } from '../domain/prng'
import { transaction } from '../domain/transactions'
import { BUDGETS, type CardId, CARDS, CATEGORIES, type CategoryId, type ExpenseCategoryId } from '../domain/world'
import { type CardStatus, type Edits, getEdits, setBudget, setCardStatus, setCategoryEntries } from './edits'
import {
  budgetsAction,
  cancelAllForTest,
  cardsAction,
  categoriesAction,
  COMMIT_LATENCY_MS,
  commitLater,
  flushForTest,
  getEffectiveBudget,
  getEffectiveBudgets,
  getEffectiveCardStatus,
  getEffectiveCategories,
  HISTORY_LIMIT,
  keyListenerCountForTest,
  release,
  subscribeEffectiveBudget,
  subscribeEffectiveBudgets,
  subscribeEffectiveCard,
  subscribeEffectiveCategories,
  undo,
} from './optimistic'

const POOL = [0, 1, 2, 3, 4, 5]

type ModelValue = string | number | null

interface ModelAction {
  readonly id: string
  readonly entries: ReadonlyArray<readonly [string, ModelValue]>
  readonly commitAt: number
  committed: boolean
}

type StoreEvent =
  | { readonly kind: 'action'; readonly action: ModelAction }
  | { readonly kind: 'outside'; readonly entries: ReadonlyArray<readonly [string, ModelValue]> }

const CARD_POOL: readonly CardId[] = ['card-01', 'card-04']
const BUDGET_POOL: readonly ExpenseCategoryId[] = ['travel', 'meals']

function other(id: number, offset = 1): CategoryId {
  const index = CATEGORIES.findIndex((category) => category.id === transaction(id).category)
  return CATEGORIES[(index + offset) % CATEGORIES.length]?.id ?? 'travel'
}

function seededCard(cardId: string): CardStatus | null {
  return CARDS.find((card) => card.id === cardId)?.status ?? null
}

function seededBudget(categoryId: string): number | null {
  return BUDGETS.find((budget) => budget.categoryId === categoryId)?.monthlyAmount ?? null
}

function seededOf(key: string): ModelValue {
  const [kind = '', raw = ''] = key.split(':')
  if (kind === 'categories') {
    return transaction(Number(raw)).category
  }
  return kind === 'cards' ? seededCard(raw) : seededBudget(raw)
}

type Flat = Record<string, ModelValue>

function write(state: Flat, key: string, value: ModelValue): void {
  if (value === null || value === seededOf(key)) {
    Reflect.deleteProperty(state, key)
  } else {
    state[key] = value
  }
}

function replayStore(initial: Flat, timeline: readonly StoreEvent[]): Flat {
  const state: Flat = { ...initial }
  for (const event of timeline) {
    for (const [key, value] of event.kind === 'outside' ? event.entries : event.action.entries) {
      write(state, key, value)
    }
  }
  return state
}

function overlay(store: Flat, actions: readonly ModelAction[]): Flat {
  const state: Flat = { ...store }
  for (const action of actions) {
    for (const [key, value] of action.entries) {
      write(state, key, value)
    }
  }
  return state
}

function flatten(edits: Pick<Edits, 'categories' | 'cards' | 'budgets'>): Flat {
  const state: Flat = {}
  const sections: ReadonlyArray<readonly [string, Readonly<Record<string, ModelValue | undefined>>]> = [
    ['categories', edits.categories],
    ['cards', edits.cards],
    ['budgets', edits.budgets],
  ]
  for (const [kind, section] of sections) {
    for (const [id, value] of Object.entries(section)) {
      state[`${kind}:${id}`] = value ?? null
    }
  }
  return state
}

function flattenEffective(): Flat {
  const state = flatten({ categories: getEffectiveCategories(), cards: {}, budgets: {} })
  for (const card of CARDS) {
    write(state, `cards:${card.id}`, getEffectiveCardStatus(card.id))
  }
  for (const budget of BUDGETS) {
    write(state, `budgets:${budget.categoryId}`, getEffectiveBudget(budget.categoryId))
  }
  return state
}

function storedFlat(): Flat {
  const raw = window.localStorage.getItem('edits')
  return raw === null ? {} : flatten(JSON.parse(raw) as Pick<Edits, 'categories' | 'cards' | 'budgets'>)
}

function resetPool(): void {
  setCategoryEntries(POOL.map((id) => [id, null] as const))
  for (const cardId of CARD_POOL) {
    setCardStatus(cardId, seededCard(cardId) ?? 'active')
  }
  for (const categoryId of BUDGET_POOL) {
    setBudget(categoryId, null)
  }
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
})

describe('optimistic card and budget edits', () => {
  it('freezes a card at once, writes it after the latency and undo before the commit writes nothing', async () => {
    const handle = commitLater(cardsAction('card-01', 'frozen'))
    expect(getEffectiveCardStatus('card-01')).toBe('frozen')
    expect(getEdits().cards['card-01']).toBeUndefined()

    expect(undo(handle.id)).toEqual({ restored: 1, total: 1 })
    await expect(handle.settled).resolves.toBeUndefined()
    vi.runAllTimers()
    expect(getEdits().cards).toEqual({})
    expect(getEffectiveCardStatus('card-01')).toBe('active')
  })

  it('restores the card status in both stores when undo follows the commit', () => {
    const handle = commitLater(cardsAction('card-04', 'active'))
    vi.advanceTimersByTime(COMMIT_LATENCY_MS)
    expect(getEdits().cards['card-04']).toBe('active')

    expect(undo(handle.id)).toEqual({ restored: 1, total: 1 })
    expect(getEdits().cards).toEqual({})
    expect(getEffectiveCardStatus('card-04')).toBe('frozen')
    expect(storedFlat()).toEqual(flatten(getEdits()))
  })

  it('hands a budget over to the newer action layered on it and keeps it when the older one is undone', () => {
    const older = commitLater(budgetsAction('travel', 100_000))
    const newer = commitLater(budgetsAction('travel', 250_000))
    flushForTest()

    expect(undo(older.id)).toEqual({ restored: 0, total: 1 })
    expect(getEdits().budgets.travel).toBe(250_000)
    expect(undo(newer.id)).toEqual({ restored: 1, total: 1 })
    expect(getEdits().budgets).toEqual({})
    expect(getEffectiveBudget('travel')).toBe(seededBudget('travel'))
  })

  it('restores a budget after the commit and leaves one changed outside the layer', () => {
    const restored = commitLater(budgetsAction('meals', 100_000))
    const kept = commitLater(budgetsAction('travel', 100_000))
    flushForTest()
    setBudget('travel', 777_700)

    expect(undo(restored.id)).toEqual({ restored: 1, total: 1 })
    expect(undo(kept.id)).toEqual({ restored: 0, total: 1 })
    expect(getEdits().budgets).toEqual({ travel: 777_700 })
  })

  it('rejects a negative or fractional budget', () => {
    expect(() => commitLater({ kind: 'budgets', categoryId: 'travel', monthlyAmount: -1, previous: 0 })).toThrow(RangeError)
    expect(() => commitLater({ kind: 'budgets', categoryId: 'travel', monthlyAmount: 1.5, previous: 0 })).toThrow(RangeError)
    expect(() => commitLater({ kind: 'budgets', categoryId: 'travel', monthlyAmount: 9e15, previous: 0 })).toThrow(RangeError)
  })

  it('notifies only the subscribers of the changed key and keeps the budgets snapshot stable for card actions', () => {
    const sameCard = vi.fn()
    const otherCard = vi.fn()
    const categories = vi.fn()
    const stops = [
      subscribeEffectiveCard('card-01', sameCard),
      subscribeEffectiveCard('card-02', otherCard),
      subscribeEffectiveCategories(categories),
    ]
    expect(keyListenerCountForTest()).toBe(2)
    const budgets = getEffectiveBudgets()
    const categoriesBefore = getEffectiveCategories()

    commitLater(cardsAction('card-01', 'frozen'))
    expect(sameCard).toHaveBeenCalledTimes(1)
    expect(otherCard).not.toHaveBeenCalled()
    expect(categories).not.toHaveBeenCalled()
    expect(getEffectiveBudgets()).toBe(budgets)
    expect(getEffectiveCategories()).toBe(categoriesBefore)

    for (const stop of stops) {
      stop()
    }
    expect(keyListenerCountForTest()).toBe(0)
  })

  it('leaves card and category subscribers alone for a budget action', () => {
    const card = vi.fn()
    const categories = vi.fn()
    const sameBudget = vi.fn()
    const otherBudget = vi.fn()
    const budgetsList = vi.fn()
    const stops = [
      subscribeEffectiveCard('card-01', card),
      subscribeEffectiveCategories(categories),
      subscribeEffectiveBudget('travel', sameBudget),
      subscribeEffectiveBudget('meals', otherBudget),
      subscribeEffectiveBudgets(budgetsList),
    ]
    const categoriesBefore = getEffectiveCategories()
    const budgetsBefore = getEffectiveBudgets()

    commitLater(budgetsAction('travel', 100_000))
    expect(sameBudget).toHaveBeenCalledTimes(1)
    expect(budgetsList).toHaveBeenCalledTimes(1)
    expect(otherBudget).not.toHaveBeenCalled()
    expect(card).not.toHaveBeenCalled()
    expect(categories).not.toHaveBeenCalled()
    expect(getEffectiveCategories()).toBe(categoriesBefore)
    expect(getEffectiveBudgets()).not.toBe(budgetsBefore)
    expect(getEffectiveBudgets().get('travel')).toBe(100_000)

    for (const stop of stops) {
      stop()
    }
  })

  it('keeps both stores equal to a replay of the surviving actions and outside writes for seeded sequences over every kind', () => {
    const categoryValues: ReadonlyArray<CategoryId | null> = [
      null,
      ...POOL.map((id) => transaction(id).category),
      ...POOL.slice(0, 3).map((id) => other(id)),
    ]
    const outsideCategories = CATEGORIES.map((category) => category.id).filter((id) => !categoryValues.includes(id))
    expect(outsideCategories.length).toBeGreaterThan(0)
    const statuses: readonly CardStatus[] = ['active', 'frozen']
    const budgetValues = [...BUDGET_POOL.map((categoryId) => seededBudget(categoryId) ?? 0), 100_000, 250_000]
    const outsideBudgets = [777_700, 888_800]

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
      setCategoryEntries([[pick(POOL), pick(outsideCategories)]])
      const initial = flatten(getEdits())
      const timeline: StoreEvent[] = []
      const undone: string[] = []
      let surviving: ModelAction[] = []
      let now = 0

      for (let step = 0; step < 40; step += 1) {
        const roll = random()
        if (roll < 0.4) {
          const kind = random()
          let id: string
          let entries: Array<readonly [string, ModelValue]>
          if (kind < 0.5) {
            const chosen = POOL.filter(() => random() < 0.4)
            const ids = chosen.length === 0 ? [pick(POOL)] : chosen
            const categoryId = pick(categoryValues)
            id = commitLater(categoriesAction(ids, categoryId)).id
            entries = ids.map((target) => [`categories:${String(target)}`, categoryId] as const)
          } else if (kind < 0.75) {
            const cardId = pick(CARD_POOL)
            const status = pick(statuses)
            id = commitLater(cardsAction(cardId, status)).id
            entries = [[`cards:${cardId}`, status]]
          } else {
            const categoryId = pick(BUDGET_POOL)
            const amount = pick(budgetValues)
            id = commitLater(budgetsAction(categoryId, amount)).id
            entries = [[`budgets:${categoryId}`, amount]]
          }
          surviving.push({ id, entries, commitAt: now + COMMIT_LATENCY_MS, committed: false })
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
          const categoryEntries = POOL.filter(() => random() < 0.3).map((id) => [id, pick(outsideCategories)] as const)
          setCategoryEntries(categoryEntries)
          const entries: Array<readonly [string, ModelValue]> = categoryEntries.map(([id, value]) => [`categories:${String(id)}`, value] as const)
          if (random() < 0.5) {
            const categoryId = pick(BUDGET_POOL)
            const amount = pick(outsideBudgets)
            setBudget(categoryId, amount)
            entries.push([`budgets:${categoryId}`, amount])
          }
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
        expect(flatten(getEdits())).toEqual(store)
        expect(flattenEffective()).toEqual(overlay(store, surviving.filter((action) => !action.committed)))
      }

      vi.runAllTimers()
      for (const action of surviving.filter((candidate) => !candidate.committed)) {
        action.committed = true
        timeline.push({ kind: 'action', action })
      }
      expect(flatten(getEdits())).toEqual(replayStore(initial, timeline))
      expect(flattenEffective()).toEqual(flatten(getEdits()))
      expect(storedFlat()).toEqual(flatten(getEdits()))
    }
  })
})
