import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { mergeRefs } from './refs'

describe('mergeRefs', () => {
  it('assigns both refs and resets them on cleanup', () => {
    const local = createRef<HTMLInputElement>()
    const forwarded = createRef<HTMLInputElement>()
    const node = document.createElement('input')

    const cleanup = mergeRefs(local, forwarded)(node)
    expect(local.current).toBe(node)
    expect(forwarded.current).toBe(node)

    if (typeof cleanup === 'function') {
      cleanup()
    }
    expect(local.current).toBeNull()
    expect(forwarded.current).toBeNull()
  })

  it('prefers the cleanup returned by a callback ref over calling it with null', () => {
    const local = createRef<HTMLInputElement>()
    const consumerCleanup = vi.fn()
    const consumer = vi.fn(() => consumerCleanup)
    const node = document.createElement('input')

    const cleanup = mergeRefs(local, consumer)(node)
    if (typeof cleanup === 'function') {
      cleanup()
    }

    expect(consumer).toHaveBeenCalledTimes(1)
    expect(consumer).toHaveBeenCalledWith(node)
    expect(consumerCleanup).toHaveBeenCalledTimes(1)
  })

  it('calls a plain callback ref with null on cleanup', () => {
    const local = createRef<HTMLInputElement>()
    const consumer = vi.fn()
    const node = document.createElement('input')

    const cleanup = mergeRefs(local, consumer)(node)
    if (typeof cleanup === 'function') {
      cleanup()
    }

    expect(consumer.mock.calls).toEqual([[node], [null]])
  })
})
