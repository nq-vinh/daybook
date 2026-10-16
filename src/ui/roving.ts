import { useRef, type RefCallback } from 'react'

export type RovingMove = 'first' | 'last' | 'next' | 'previous'

export interface RovingOptions<T> {
  readonly wrap: boolean
  readonly step?: number | undefined
  readonly isDisabled?: ((item: T) => boolean) | undefined
}

export function rovingIndex<T>(items: readonly T[], current: number, move: RovingMove, options: RovingOptions<T>): number {
  const count = items.length
  const isEnabled = (index: number) => {
    const item = items[index]
    return item !== undefined && options.isDisabled?.(item) !== true
  }

  if (count === 0) {
    return -1
  }

  const forward = move === 'first' || move === 'next'
  const direction = forward ? 1 : -1
  const step = options.step ?? 1
  let start: number

  if (move === 'first') {
    start = 0
  } else if (move === 'last') {
    start = count - 1
  } else if (options.wrap) {
    start = (((current + direction * step) % count) + count) % count
  } else {
    start = Math.min(count - 1, Math.max(0, current + direction * step))
  }

  for (let offset = 0; offset < count; offset += 1) {
    const index = options.wrap || move === 'first' || move === 'last'
      ? (((start + direction * offset) % count) + count) % count
      : start + direction * offset

    if (index < 0 || index >= count) {
      break
    }

    if (isEnabled(index)) {
      return index
    }
  }

  return isEnabled(current) ? current : -1
}

export interface ElementMap<T extends HTMLElement> {
  readonly register: (key: string) => RefCallback<T>
  readonly get: (key: string) => T | undefined
  readonly values: () => T[]
}

export function useElementMap<T extends HTMLElement>(): ElementMap<T> {
  const elements = useRef<Map<string, T> | null>(null)

  function map(): Map<string, T> {
    elements.current ??= new Map()
    return elements.current
  }

  return {
    register: (key) => (node) => {
      if (node === null) {
        return
      }

      map().set(key, node)
      return () => {
        if (map().get(key) === node) {
          map().delete(key)
        }
      }
    },
    get: (key) => map().get(key),
    values: () => [...map().values()],
  }
}
