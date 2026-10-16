import { useSyncExternalStore } from 'react'

import { transaction, TRANSACTION_COUNT } from '../domain/transactions'
import { BUDGETS, type CardId, CARDS, CATEGORIES, type CategoryId, type ExpenseCategoryId } from '../domain/world'

export type CardStatus = 'active' | 'frozen'

export interface Edits {
  readonly categories: Readonly<Partial<Record<number, CategoryId>>>
  readonly notes: Readonly<Partial<Record<number, string>>>
  readonly budgets: Readonly<Partial<Record<ExpenseCategoryId, number>>>
  readonly cards: Readonly<Partial<Record<CardId, CardStatus>>>
}

const STORAGE_KEY = 'edits'
const STORAGE_VERSION = 1

const EMPTY_EDITS: Edits = Object.freeze({
  categories: Object.freeze({}),
  notes: Object.freeze({}),
  budgets: Object.freeze({}),
  cards: Object.freeze({}),
})

const listeners = new Set<() => void>()

let edits: Edits | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTransactionId(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < TRANSACTION_COUNT
}

function isBudgetAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function findCategory(value: unknown): CategoryId | null {
  return CATEGORIES.find((category) => category.id === value)?.id ?? null
}

const EXPENSE_CATEGORY_IDS: readonly ExpenseCategoryId[] = BUDGETS.map((budget) => budget.categoryId)

function findExpenseCategory(value: unknown): ExpenseCategoryId | null {
  return EXPENSE_CATEGORY_IDS.find((categoryId) => categoryId === value) ?? null
}

function findCard(value: unknown): CardId | null {
  return CARDS.find((card) => card.id === value)?.id ?? null
}

function isCardStatus(value: unknown): value is CardStatus {
  return value === 'active' || value === 'frozen'
}

function readEntries<K extends PropertyKey, V>(
  source: unknown,
  readKey: (key: string) => K | null,
  readValue: (value: unknown) => V | null,
): Partial<Record<K, V>> | null {
  if (!isRecord(source)) {
    return null
  }
  const entries: Partial<Record<K, V>> = {}
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = readKey(rawKey)
    const value = readValue(rawValue)
    if (key !== null && value !== null) {
      entries[key] = value
    }
  }
  return entries
}

function readTransactionId(key: string): number | null {
  const id = Number(key)
  return /^\d+$/.test(key) && isTransactionId(id) ? id : null
}

function freezeEdits(next: Edits): Edits {
  return Object.freeze({
    categories: Object.freeze({ ...next.categories }),
    notes: Object.freeze({ ...next.notes }),
    budgets: Object.freeze({ ...next.budgets }),
    cards: Object.freeze({ ...next.cards }),
  })
}

export function parseEdits(raw: string | null): Edits {
  if (raw === null) {
    return EMPTY_EDITS
  }

  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return EMPTY_EDITS
  }

  if (!isRecord(stored) || stored.version !== STORAGE_VERSION) {
    return EMPTY_EDITS
  }

  const categories = readEntries(stored.categories, readTransactionId, findCategory)
  const notes = readEntries(stored.notes, readTransactionId, (value) => (typeof value === 'string' && value.trim() !== '' ? value : null))
  const budgets = readEntries(stored.budgets, findExpenseCategory, (value) => (isBudgetAmount(value) ? value : null))
  const cards = readEntries(stored.cards, findCard, (value) => (isCardStatus(value) ? value : null))

  if (categories === null || notes === null || budgets === null || cards === null) {
    return EMPTY_EDITS
  }

  return freezeEdits({ categories, notes, budgets, cards })
}

function readStoredEdits(): Edits {
  try {
    return parseEdits(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return EMPTY_EDITS
  }
}

function storeEdits(next: Edits): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...next }))
  } catch {
    return
  }
}

function publish(next: Edits): void {
  edits = next
  for (const listener of listeners) {
    listener()
  }
}

function commit(section: Partial<Edits>): void {
  const next: Edits = Object.freeze({ ...getEdits(), ...section })
  storeEdits(next)
  publish(next)
}

function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY || event.key === null) {
    publish(parseEdits(event.newValue))
  }
}

function withoutKey<K extends PropertyKey, V>(record: Readonly<Partial<Record<K, V>>>, key: K): Partial<Record<K, V>> {
  const copy: Partial<Record<K, V>> = { ...record }
  Reflect.deleteProperty(copy, key)
  return copy
}

function assertTransactionId(id: number): void {
  if (!isTransactionId(id)) {
    throw new RangeError(`Transaction index out of range: ${String(id)}`)
  }
}

export function getEdits(): Edits {
  edits ??= readStoredEdits()
  return edits
}

export function subscribeEdits(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('storage', handleStorage)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('storage', handleStorage)
    }
  }
}

export function setCategoryEntries(entries: Iterable<readonly [number, CategoryId | null]>): void {
  const targets = new Map<number, CategoryId | null>()
  for (const [id, categoryId] of entries) {
    assertTransactionId(id)
    targets.set(id, categoryId)
  }
  const kept = Object.entries(getEdits().categories).filter(([id]) => !targets.has(Number(id)))
  const added = [...targets].flatMap(([id, categoryId]) => (
    categoryId === null || transaction(id).category === categoryId ? [] : [[String(id), categoryId] as const]
  ))
  commit({ categories: Object.freeze(Object.fromEntries([...kept, ...added])) })
}

export function setNote(id: number, note: string): void {
  assertTransactionId(id)
  const current = getEdits()
  const notes = note.trim() === '' ? withoutKey(current.notes, id) : { ...current.notes, [id]: note }
  commit({ notes: Object.freeze(notes) })
}

export function setBudget(categoryId: ExpenseCategoryId, monthlyAmount: number | null): void {
  if (monthlyAmount !== null && !isBudgetAmount(monthlyAmount)) {
    throw new RangeError(`Budget must be a non-negative integer amount: ${String(monthlyAmount)}`)
  }
  const current = getEdits()
  const seeded = BUDGETS.find((budget) => budget.categoryId === categoryId)?.monthlyAmount
  const budgets = monthlyAmount === null || monthlyAmount === seeded
    ? withoutKey(current.budgets, categoryId)
    : { ...current.budgets, [categoryId]: monthlyAmount }
  commit({ budgets: Object.freeze(budgets) })
}

export function setCardStatus(cardId: CardId, status: CardStatus): void {
  const current = getEdits()
  const seeded = CARDS.find((card) => card.id === cardId)?.status
  const cards = status === seeded ? withoutKey(current.cards, cardId) : { ...current.cards, [cardId]: status }
  commit({ cards: Object.freeze(cards) })
}

export function categoryEditEntries(categories: Edits['categories']): Array<[number, CategoryId]> {
  return Object.entries(categories).flatMap(([id, categoryId]): Array<[number, CategoryId]> => (
    categoryId === undefined ? [] : [[Number(id), categoryId]]
  ))
}

export function useEdits(): Edits {
  return useSyncExternalStore(subscribeEdits, getEdits)
}
