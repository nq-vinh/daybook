import type { Ref, RefCallback, RefObject } from 'react'

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): () => void {
  if (typeof ref === 'function') {
    const cleanup = ref(value)
    return typeof cleanup === 'function'
      ? cleanup
      : () => {
          ref(null)
        }
  }

  if (ref !== null && ref !== undefined) {
    ref.current = value
    return () => {
      ref.current = null
    }
  }

  return () => undefined
}

export function mergeRefs<T>(local: RefObject<T | null>, forwarded: Ref<T> | undefined): RefCallback<T> {
  return (node) => {
    local.current = node
    const cleanup = assignRef(forwarded, node)

    return () => {
      local.current = null
      cleanup()
    }
  }
}
