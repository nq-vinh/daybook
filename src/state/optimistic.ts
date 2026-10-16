import { useSyncExternalStore } from 'react'

import { transaction } from '../domain/transactions'
import { BUDGETS, type CardId, CARDS, CATEGORIES, type CategoryId, type ExpenseCategoryId } from '../domain/world'
import { MAX_MINOR_UNITS } from '../ui/NumberField/money'
import {
  type CardStatus,
  type Edits,
  getEdits,
  isBudgetAmount,
  setBudget,
  setCardStatus,
  setCategoryEntries,
  subscribeEdits,
} from './edits'

export const COMMIT_LATENCY_MS = 400
export const HISTORY_LIMIT = 50

export interface CategoriesAction {
  readonly kind: 'categories'
  readonly ids: readonly number[]
  readonly categoryId: CategoryId | null
  readonly previous: ReadonlyArray<readonly [number, CategoryId | null]>
}

export interface CardsAction {
  readonly kind: 'cards'
  readonly cardId: CardId
  readonly status: CardStatus
  readonly previous: CardStatus
}

export interface BudgetsAction {
  readonly kind: 'budgets'
  readonly categoryId: ExpenseCategoryId
  readonly monthlyAmount: number
  readonly previous: number
}

export type OptimisticAction = CategoriesAction | CardsAction | BudgetsAction

export type OptimisticKind = OptimisticAction['kind']

export interface CommitHandle {
  readonly id: string
  readonly settled: Promise<void>
}

export interface UndoResult {
  readonly restored: number
  readonly total: number
}

type Value = string | number | null

interface PendingWrite {
  readonly keys: readonly string[]
  readonly value: Value
}

interface Entry {
  readonly id: string
  readonly kind: OptimisticKind
  readonly keys: readonly string[]
  readonly value: Value
  readonly previous: Map<string, Value>
  readonly shown: Map<string, Value>
  readonly settle: () => void
  timer: ReturnType<typeof setTimeout> | undefined
  committed: boolean
  released: boolean
}

interface KindStore {
  stored(raw: string): Value
  seeded(raw: string): Value
  write(entries: ReadonlyArray<readonly [string, Value]>): void
}

const KINDS: readonly OptimisticKind[] = ['categories', 'cards', 'budgets']

function toCategory(value: Value): CategoryId | null {
  return CATEGORIES.find((category) => category.id === value)?.id ?? null
}

function toCard(raw: string): (typeof CARDS)[number] {
  const card = CARDS.find((candidate) => candidate.id === raw)
  if (card === undefined) {
    throw new RangeError(`Unknown card: ${raw}`)
  }
  return card
}

function toBudget(raw: string): (typeof BUDGETS)[number] {
  const budget = BUDGETS.find((candidate) => candidate.categoryId === raw)
  if (budget === undefined) {
    throw new RangeError(`Unknown budget category: ${raw}`)
  }
  return budget
}

function toStatus(value: Value): CardStatus | null {
  return value === 'active' || value === 'frozen' ? value : null
}

const STORES: Record<OptimisticKind, KindStore> = {
  categories: {
    stored: (raw) => getEdits().categories[Number(raw)] ?? null,
    seeded: (raw) => transaction(Number(raw)).category,
    write: (entries) => {
      setCategoryEntries(entries.map(([raw, value]) => [Number(raw), toCategory(value)] as const))
    },
  },
  cards: {
    stored: (raw) => getEdits().cards[toCard(raw).id] ?? null,
    seeded: (raw) => toCard(raw).status,
    write: (entries) => {
      for (const [raw, value] of entries) {
        const card = toCard(raw)
        setCardStatus(card.id, toStatus(value) ?? card.status)
      }
    },
  },
  budgets: {
    stored: (raw) => getEdits().budgets[toBudget(raw).categoryId] ?? null,
    seeded: (raw) => toBudget(raw).monthlyAmount,
    write: (entries) => {
      for (const [raw, value] of entries) {
        setBudget(toBudget(raw).categoryId, typeof value === 'number' ? value : null)
      }
    },
  },
}

const EMPTY_CATEGORIES: Edits['categories'] = Object.freeze({})
const EMPTY_PENDING: readonly PendingWrite[] = Object.freeze([])

const kindListeners: Record<OptimisticKind, Set<() => void>> = { categories: new Set(), cards: new Set(), budgets: new Set() }
const keyListeners = new Map<string, Set<() => void>>()
const history: Entry[] = []

const pending: Record<OptimisticKind, readonly PendingWrite[]> = { categories: EMPTY_PENDING, cards: EMPTY_PENDING, budgets: EMPTY_PENDING }
let nextId = 1
let effective = EMPTY_CATEGORIES
let effectiveBase: Edits['categories'] | null = null
let effectivePending: readonly PendingWrite[] | null = null

function keyOf(kind: OptimisticKind, raw: string | number): string {
  return `${kind}:${String(raw)}`
}

function rawOf(kind: OptimisticKind, key: string): string {
  return key.slice(kind.length + 1)
}

function resolveValue(kind: OptimisticKind, key: string, value: Value | undefined): Value {
  return value ?? STORES[kind].seeded(rawOf(kind, key))
}

function storedValue(kind: OptimisticKind, key: string): Value {
  return STORES[kind].stored(rawOf(kind, key))
}

function publishPending(kinds: Iterable<OptimisticKind>, keys: Iterable<string>): void {
  const changed = new Set(kinds)
  for (const kind of changed) {
    pending[kind] = Object.freeze(history
      .filter((entry) => entry.kind === kind && !entry.committed)
      .map(({ keys: entryKeys, value }) => Object.freeze({ keys: entryKeys, value })))
  }
  const notified = new Set<() => void>()
  for (const kind of changed) {
    for (const listener of kindListeners[kind]) {
      notified.add(listener)
    }
  }
  for (const key of keys) {
    for (const listener of keyListeners.get(key) ?? []) {
      notified.add(listener)
    }
  }
  for (const listener of notified) {
    listener()
  }
}

function publishEntry(entry: Entry): void {
  publishPending([entry.kind], entry.keys)
}

function prune(): void {
  while (history[0]?.released === true && history[0].committed) {
    history.shift()
  }
}

function commitEntry(entry: Entry): void {
  clearTimeout(entry.timer)
  entry.timer = undefined
  entry.committed = true
  for (const key of entry.keys) {
    entry.previous.set(key, storedValue(entry.kind, key))
  }
  STORES[entry.kind].write(entry.keys.map((key) => [rawOf(entry.kind, key), entry.value] as const))
  publishEntry(entry)
  prune()
  entry.settle()
}

function applyPending(base: Edits['categories'], actions: readonly PendingWrite[]): Edits['categories'] {
  const merged: Partial<Record<number, CategoryId>> = { ...base }
  for (const { keys, value } of actions) {
    const categoryId = toCategory(value)
    for (const key of keys) {
      const id = Number(rawOf('categories', key))
      if (categoryId === null || categoryId === transaction(id).category) {
        Reflect.deleteProperty(merged, id)
      } else {
        merged[id] = categoryId
      }
    }
  }
  return Object.freeze(merged)
}

function sameCategories(left: Edits['categories'], right: Edits['categories']): boolean {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => left[Number(key)] === right[Number(key)])
}

function effectiveValue(kind: OptimisticKind, key: string): Value {
  const writes = pending[kind]
  for (let index = writes.length - 1; index >= 0; index -= 1) {
    const write = writes[index]
    if (write?.keys.includes(key) === true) {
      return resolveValue(kind, key, write.value)
    }
  }
  return resolveValue(kind, key, storedValue(kind, key))
}

function subscribeKey(key: string, listener: () => void): () => void {
  const stopEdits = subscribeEdits(listener)
  const set = keyListeners.get(key) ?? new Set<() => void>()
  set.add(listener)
  keyListeners.set(key, set)
  return () => {
    stopEdits()
    set.delete(listener)
    if (set.size === 0 && keyListeners.get(key) === set) {
      keyListeners.delete(key)
    }
  }
}

export function getEffectiveCategories(): Edits['categories'] {
  const base = getEdits().categories
  const writes = pending.categories
  if (base !== effectiveBase || writes !== effectivePending) {
    effectiveBase = base
    effectivePending = writes
    const merged = writes.length === 0 ? base : applyPending(base, writes)
    if (!sameCategories(merged, effective)) {
      effective = merged
    }
  }
  return effective
}

export function subscribeEffectiveCategories(listener: () => void): () => void {
  const stopEdits = subscribeEdits(listener)
  kindListeners.categories.add(listener)
  return () => {
    stopEdits()
    kindListeners.categories.delete(listener)
  }
}

export function getEffectiveCardStatus(cardId: CardId): CardStatus {
  return toStatus(effectiveValue('cards', keyOf('cards', cardId))) ?? toCard(cardId).status
}

export function subscribeEffectiveCard(cardId: CardId, listener: () => void): () => void {
  return subscribeKey(keyOf('cards', cardId), listener)
}

export function getEffectiveBudget(categoryId: ExpenseCategoryId): number {
  const value = effectiveValue('budgets', keyOf('budgets', categoryId))
  return typeof value === 'number' ? value : toBudget(categoryId).monthlyAmount
}

export function subscribeEffectiveBudget(categoryId: ExpenseCategoryId, listener: () => void): () => void {
  return subscribeKey(keyOf('budgets', categoryId), listener)
}

let effectiveBudgets: ReadonlyMap<ExpenseCategoryId, number> = new Map()
let budgetsBase: Edits['budgets'] | null = null
let budgetsPending: readonly PendingWrite[] | null = null

export function getEffectiveBudgets(): ReadonlyMap<ExpenseCategoryId, number> {
  const base = getEdits().budgets
  if (base !== budgetsBase || pending.budgets !== budgetsPending) {
    budgetsBase = base
    budgetsPending = pending.budgets
    const merged = new Map(BUDGETS.map(({ categoryId }) => [categoryId, getEffectiveBudget(categoryId)] as const))
    if (merged.size !== effectiveBudgets.size || [...merged].some(([categoryId, amount]) => effectiveBudgets.get(categoryId) !== amount)) {
      effectiveBudgets = merged
    }
  }
  return effectiveBudgets
}

export function subscribeEffectiveBudgets(listener: () => void): () => void {
  const stopEdits = subscribeEdits(listener)
  kindListeners.budgets.add(listener)
  return () => {
    stopEdits()
    kindListeners.budgets.delete(listener)
  }
}

export function keyListenerCountForTest(): number {
  return [...keyListeners.values()].reduce((sum, set) => sum + set.size, 0)
}

export function categoriesAction(ids: Iterable<number>, categoryId: CategoryId | null): CategoriesAction {
  const targets = [...new Set(ids)]
  const current = getEffectiveCategories()
  return Object.freeze({
    kind: 'categories',
    ids: Object.freeze(targets),
    categoryId,
    previous: Object.freeze(targets.map((id) => Object.freeze([id, current[id] ?? null] as const))),
  })
}

export function cardsAction(cardId: CardId, status: CardStatus): CardsAction {
  return Object.freeze({ kind: 'cards', cardId, status, previous: getEffectiveCardStatus(cardId) })
}

export function budgetsAction(categoryId: ExpenseCategoryId, monthlyAmount: number): BudgetsAction {
  return Object.freeze({ kind: 'budgets', categoryId, monthlyAmount, previous: getEffectiveBudget(categoryId) })
}

interface NormalisedAction {
  readonly keys: readonly string[]
  readonly value: Value
  readonly previous: Map<string, Value>
}

function normalise(action: OptimisticAction): NormalisedAction {
  switch (action.kind) {
    case 'categories': {
      const keys = Object.freeze([...new Set(action.ids)].map((id) => keyOf('categories', id)))
      const previous = new Map<string, Value>(action.previous.map(([id, value]) => [keyOf('categories', id), value]))
      if (keys.some((key) => !previous.has(key)) || previous.size !== keys.length) {
        throw new RangeError('An optimistic action needs exactly one previous value per id.')
      }
      return { keys, value: action.categoryId, previous }
    }
    case 'cards': {
      const key = keyOf('cards', toCard(action.cardId).id)
      return { keys: Object.freeze([key]), value: action.status, previous: new Map([[key, action.previous]]) }
    }
    case 'budgets': {
      if (!isBudgetAmount(action.monthlyAmount)) {
        throw new RangeError(`Budget must be a non-negative integer amount up to ${String(MAX_MINOR_UNITS)}: ${String(action.monthlyAmount)}`)
      }
      const key = keyOf('budgets', toBudget(action.categoryId).categoryId)
      return { keys: Object.freeze([key]), value: action.monthlyAmount, previous: new Map([[key, action.previous]]) }
    }
  }
}

export function commitLater(action: OptimisticAction): CommitHandle {
  const { keys, value, previous } = normalise(action)
  const id = `edit-${String(nextId)}`
  nextId += 1
  let settle: () => void = () => undefined
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })
  const entry: Entry = {
    id,
    kind: action.kind,
    keys,
    value,
    previous,
    shown: new Map(previous),
    settle,
    timer: undefined,
    committed: false,
    released: false,
  }
  entry.timer = setTimeout(() => {
    commitEntry(entry)
  }, COMMIT_LATENCY_MS)
  history.push(entry)
  const unreleased = history.filter((candidate) => !candidate.released)
  for (const candidate of unreleased.slice(0, Math.max(0, unreleased.length - HISTORY_LIMIT))) {
    candidate.released = true
  }
  prune()
  publishEntry(entry)
  return { id, settled }
}

export function undo(actionId: string): UndoResult | null {
  const entry = history.find((candidate) => candidate.id === actionId)
  if (entry === undefined || entry.released) {
    return null
  }
  const { kind } = entry
  const later = history.slice(history.indexOf(entry) + 1)
  const restores: Array<readonly [string, Value]> = []
  const returned: string[] = []

  for (const key of entry.keys) {
    const previous = entry.previous.get(key) ?? null
    const next = later.find((candidate) => candidate.previous.has(key))
    if (next !== undefined && resolveValue(kind, key, next.previous.get(key)) === resolveValue(kind, key, entry.value)) {
      next.previous.set(key, previous)
      next.shown.set(key, entry.shown.get(key) ?? null)
    }

    if (!entry.committed) {
      returned.push(key)
    } else if (!later.some((candidate) => candidate.committed && candidate.previous.has(key))
      && resolveValue(kind, key, storedValue(kind, key)) === resolveValue(kind, key, entry.value)) {
      restores.push([rawOf(kind, key), previous])
      returned.push(key)
    }
  }

  clearTimeout(entry.timer)
  history.splice(history.indexOf(entry), 1)
  if (restores.length > 0) {
    STORES[kind].write(restores)
  }
  publishEntry(entry)
  prune()
  entry.settle()
  const restored = returned.filter((key) => effectiveValue(kind, key) === resolveValue(kind, key, entry.shown.get(key)))
  return { restored: restored.length, total: entry.keys.length }
}

export function release(actionId: string): void {
  const entry = history.find((candidate) => candidate.id === actionId)
  if (entry !== undefined) {
    entry.released = true
    prune()
  }
}

export function flushForTest(): void {
  for (const entry of history.filter((candidate) => !candidate.committed)) {
    commitEntry(entry)
  }
}

export function cancelAllForTest(): void {
  const keys = new Set<string>()
  for (const entry of history.splice(0)) {
    clearTimeout(entry.timer)
    entry.settle()
    for (const key of entry.keys) {
      keys.add(key)
    }
  }
  publishPending(KINDS, keys)
}

export function useEffectiveCategory(id: number): CategoryId {
  return useSyncExternalStore(subscribeEffectiveCategories, () => getEffectiveCategories()[id] ?? transaction(id).category)
}

export function useEffectiveCardStatus(cardId: CardId): CardStatus {
  return useSyncExternalStore((listener) => subscribeEffectiveCard(cardId, listener), () => getEffectiveCardStatus(cardId))
}

export function useEffectiveBudgets(): ReadonlyMap<ExpenseCategoryId, number> {
  return useSyncExternalStore(subscribeEffectiveBudgets, getEffectiveBudgets)
}

export function useEffectiveBudget(categoryId: ExpenseCategoryId): number {
  return useSyncExternalStore((listener) => subscribeEffectiveBudget(categoryId, listener), () => getEffectiveBudget(categoryId))
}
