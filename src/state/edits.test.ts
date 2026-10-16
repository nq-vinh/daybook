import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { transaction } from '../domain/transactions'

type EditsModule = typeof import('./edits')

async function freshStore(stored?: unknown): Promise<EditsModule> {
  window.localStorage.clear()
  if (stored !== undefined) {
    window.localStorage.setItem('edits', typeof stored === 'string' ? stored : JSON.stringify(stored))
  }
  vi.resetModules()
  return import('./edits')
}

function storedEdits(): unknown {
  return JSON.parse(window.localStorage.getItem('edits') ?? 'null')
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('edits store', () => {
  it('starts empty and frozen', async () => {
    const { getEdits } = await freshStore()
    const edits = getEdits()

    expect(edits).toEqual({ categories: {}, notes: {}, budgets: {}, cards: {} })
    expect(Object.isFrozen(edits)).toBe(true)
    expect(Object.isFrozen(edits.categories)).toBe(true)
  })

  it('persists every kind of edit under a versioned key and publishes a new frozen snapshot', async () => {
    const { getEdits, setBudget, setCardStatus, setCategoryEntries, setNote } = await freshStore()
    const before = getEdits()
    const seeded = transaction(1_000).category
    const other = seeded === 'travel' ? 'meals' : 'travel'

    setCategoryEntries([[1_000, other]])
    setNote(1_000, 'Reimbursed by client')
    setBudget('travel', 1_500_000)
    setCardStatus('card-01', 'frozen')

    const after = getEdits()
    expect(after).not.toBe(before)
    expect(Object.isFrozen(after.notes)).toBe(true)
    expect(after).toEqual({
      categories: { 1000: other },
      notes: { 1000: 'Reimbursed by client' },
      budgets: { travel: 1_500_000 },
      cards: { 'card-01': 'frozen' },
    })
    expect(storedEdits()).toEqual({ version: 1, ...after })
  })

  it('removes an edit that is cleared or set back to the seeded value', async () => {
    const { getEdits, setBudget, setCardStatus, setCategoryEntries, setNote } = await freshStore()
    const seeded = transaction(42).category

    setCategoryEntries([[42, seeded === 'travel' ? 'meals' : 'travel']])
    setCategoryEntries([[42, seeded]])
    setCategoryEntries([[43, 'travel']])
    setCategoryEntries([[43, null]])
    setNote(42, 'note')
    setNote(42, '   ')
    setBudget('rent', 10)
    setBudget('rent', null)
    setBudget('travel', 100)
    setBudget('travel', 17_000_000)
    setCardStatus('card-04', 'active')
    setCardStatus('card-04', 'frozen')

    expect(getEdits()).toEqual({ categories: {}, notes: {}, budgets: {}, cards: {} })
  })

  it('replaces only the edited section and keeps the other references', async () => {
    const { getEdits, setBudget, setCardStatus, setNote } = await freshStore()
    const before = getEdits()

    setNote(9, 'Checked')
    const noted = getEdits()
    expect(noted.notes).not.toBe(before.notes)
    expect(noted.categories).toBe(before.categories)
    expect(noted.budgets).toBe(before.budgets)
    expect(noted.cards).toBe(before.cards)
    expect(Object.isFrozen(noted)).toBe(true)
    expect(Object.isFrozen(noted.notes)).toBe(true)

    setBudget('meals', 200)
    setCardStatus('card-02', 'frozen')
    expect(getEdits().categories).toBe(before.categories)
    expect(getEdits().notes).toBe(noted.notes)
  })

  it('rejects out-of-range ids and invalid budget amounts', async () => {
    const { setBudget, setCategoryEntries, setNote } = await freshStore()

    expect(() => { setCategoryEntries([[100_000, 'travel']]) }).toThrow(RangeError)
    expect(() => { setNote(-1, 'x') }).toThrow(RangeError)
    expect(() => { setBudget('rent', 12.5) }).toThrow(RangeError)
    expect(() => { setBudget('rent', 9e15) }).toThrow(RangeError)
  })

  it('loads stored edits and drops invalid entries', async () => {
    const { getEdits } = await freshStore({
      version: 1,
      categories: { 5: 'travel', 6: 'nope', abc: 'travel', 100000: 'meals' },
      notes: { 5: 'kept', 7: 3 },
      budgets: { travel: 100, revenue: 50, rent: -1, meals: 9e15 },
      cards: { 'card-02': 'frozen', 'card-99': 'frozen', 'card-03': 'lost' },
    })

    expect(getEdits()).toEqual({
      categories: { 5: 'travel' },
      notes: { 5: 'kept' },
      budgets: { travel: 100 },
      cards: { 'card-02': 'frozen' },
    })
  })

  it.each([
    ['invalid JSON', '{not json'],
    ['a wrong version', { version: 2, categories: {}, notes: {}, budgets: {}, cards: {} }],
    ['a wrong shape', { version: 1, categories: [], notes: {}, budgets: {}, cards: {} }],
  ])('resets to empty on %s', async (_label, stored) => {
    const { getEdits } = await freshStore(stored)

    expect(getEdits()).toEqual({ categories: {}, notes: {}, budgets: {}, cards: {} })
  })

  it('re-renders category selectors and follows storage events from other tabs', async () => {
    const { setCategoryEntries, useEdits } = await freshStore()
    const edits = renderHook(() => useEdits())
    const next = transaction(7).category === 'travel' ? 'meals' : 'travel'

    act(() => {
      setCategoryEntries([[7, next]])
    })
    expect(edits.result.current.categories[7]).toBe(next)

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'edits',
        newValue: JSON.stringify({ version: 1, categories: {}, notes: { 7: 'from another tab' }, budgets: {}, cards: {} }),
      }))
    })
    expect(edits.result.current.categories[7]).toBeUndefined()
    expect(edits.result.current.notes).toEqual({ 7: 'from another tab' })
  })

  it('lists category edits as worker entries', async () => {
    const { categoryEditEntries } = await freshStore()

    expect(categoryEditEntries({ 3: 'travel', 10: 'meals' })).toEqual([[3, 'travel'], [10, 'meals']])
  })
})

describe('setCategoryEntries', () => {
  it('applies many category entries in a single commit and storage write', async () => {
    const store = await freshStore()
    const listener = vi.fn()
    store.subscribeEdits(listener)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const seeded = transaction(3).category
    const target = seeded === 'travel' ? 'meals' : 'travel'
    store.setCategoryEntries([[9, 'rent']])

    setItem.mockClear()
    listener.mockClear()
    store.setCategoryEntries([[3, target], [4, target], [9, target]])

    expect(setItem).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getEdits().categories[3]).toBe(target)
    expect(store.getEdits().categories[9]).toBe(target === transaction(9).category ? undefined : target)

    store.setCategoryEntries([[3, null], [4, null], [9, null]])
    expect(store.getEdits().categories).toEqual({})
    setItem.mockRestore()
  })
})
