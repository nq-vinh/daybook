import { useSyncExternalStore } from 'react'

import { transaction } from '../domain/transactions'
import type { CategoryId } from '../domain/world'
import { type Edits, getEdits, setCategoryEntries, subscribeEdits } from './edits'

export const COMMIT_LATENCY_MS = 400
export const HISTORY_LIMIT = 50

export interface CategoriesAction {
  readonly kind: 'categories'
  readonly ids: readonly number[]
  readonly categoryId: CategoryId | null
  readonly previous: ReadonlyArray<readonly [number, CategoryId | null]>
}

export type OptimisticAction = CategoriesAction

export interface CommitHandle {
  readonly id: string
  readonly settled: Promise<void>
}

export interface UndoResult {
  readonly restored: number
  readonly total: number
}

interface PendingCategories {
  readonly ids: readonly number[]
  readonly categoryId: CategoryId | null
}

interface Entry {
  readonly id: string
  readonly ids: readonly number[]
  readonly categoryId: CategoryId | null
  readonly previous: Map<number, CategoryId | null>
  readonly shown: Map<number, CategoryId | null>
  readonly settle: () => void
  timer: ReturnType<typeof setTimeout> | undefined
  committed: boolean
  released: boolean
}

const EMPTY_CATEGORIES: Edits['categories'] = Object.freeze({})

const listeners = new Set<() => void>()
const history: Entry[] = []

let pending: readonly PendingCategories[] = Object.freeze([])
let nextId = 1
let effective = EMPTY_CATEGORIES
let effectiveBase: Edits['categories'] | null = null
let effectivePending: readonly PendingCategories[] | null = null

function resolveCategory(id: number, categoryId: CategoryId | null | undefined): CategoryId {
  return categoryId ?? transaction(id).category
}

function publishPending(): void {
  pending = Object.freeze(history.filter((entry) => !entry.committed).map(({ ids, categoryId }) => Object.freeze({ ids, categoryId })))
  for (const listener of listeners) {
    listener()
  }
}

function prune(): void {
  while (history[0]?.released === true && history[0].committed) {
    history.shift()
  }
}

function commitEntry(entry: Entry): void {
  const stored = getEdits().categories
  clearTimeout(entry.timer)
  entry.timer = undefined
  entry.committed = true
  for (const id of entry.ids) {
    entry.previous.set(id, stored[id] ?? null)
  }
  setCategoryEntries(entry.ids.map((id) => [id, entry.categoryId] as const))
  publishPending()
  prune()
  entry.settle()
}

function applyPending(base: Edits['categories'], actions: readonly PendingCategories[]): Edits['categories'] {
  const merged: Partial<Record<number, CategoryId>> = { ...base }
  for (const { ids, categoryId } of actions) {
    for (const id of ids) {
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

export function getEffectiveCategories(): Edits['categories'] {
  const base = getEdits().categories
  if (base !== effectiveBase || pending !== effectivePending) {
    effectiveBase = base
    effectivePending = pending
    const merged = pending.length === 0 ? base : applyPending(base, pending)
    if (!sameCategories(merged, effective)) {
      effective = merged
    }
  }
  return effective
}

export function subscribeEffectiveCategories(listener: () => void): () => void {
  const stopEdits = subscribeEdits(listener)
  listeners.add(listener)
  return () => {
    stopEdits()
    listeners.delete(listener)
  }
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

export function commitLater(action: OptimisticAction): CommitHandle {
  const ids = Object.freeze([...new Set(action.ids)])
  const previous = new Map(action.previous)
  if (ids.some((target) => !previous.has(target)) || previous.size !== ids.length) {
    throw new RangeError('An optimistic action needs exactly one previous value per id.')
  }
  const id = `edit-${String(nextId)}`
  nextId += 1
  let settle: () => void = () => undefined
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })
  const entry: Entry = {
    id,
    ids,
    categoryId: action.categoryId,
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
  publishPending()
  return { id, settled }
}

export function undo(actionId: string): UndoResult | null {
  const entry = history.find((candidate) => candidate.id === actionId)
  if (entry === undefined || entry.released) {
    return null
  }
  const later = history.slice(history.indexOf(entry) + 1)
  const stored = getEdits().categories
  const restores: Array<readonly [number, CategoryId | null]> = []
  const returned: number[] = []

  for (const id of entry.ids) {
    const previous = entry.previous.get(id) ?? null
    const next = later.find((candidate) => candidate.previous.has(id))
    if (next !== undefined && resolveCategory(id, next.previous.get(id)) === resolveCategory(id, entry.categoryId)) {
      next.previous.set(id, previous)
      next.shown.set(id, entry.shown.get(id) ?? null)
    }

    if (!entry.committed) {
      returned.push(id)
    } else if (!later.some((candidate) => candidate.committed && candidate.previous.has(id))
      && resolveCategory(id, stored[id]) === resolveCategory(id, entry.categoryId)) {
      restores.push([id, previous])
      returned.push(id)
    }
  }

  clearTimeout(entry.timer)
  history.splice(history.indexOf(entry), 1)
  if (restores.length > 0) {
    setCategoryEntries(restores)
  }
  publishPending()
  prune()
  entry.settle()
  const visible = getEffectiveCategories()
  const restored = returned.filter((id) => resolveCategory(id, visible[id]) === resolveCategory(id, entry.shown.get(id)))
  return { restored: restored.length, total: entry.ids.length }
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
  for (const entry of history.splice(0)) {
    clearTimeout(entry.timer)
    entry.settle()
  }
  publishPending()
}

export function useEffectiveCategory(id: number): CategoryId {
  return useSyncExternalStore(subscribeEffectiveCategories, () => resolveCategory(id, getEffectiveCategories()[id]))
}
