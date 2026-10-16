import type { RefCallback } from 'react'

export type AnchorProperty = 'anchor-name' | 'position-anchor'

export function anchorName(prefix: string, id: string): string {
  return `--${prefix}-${id.replace(/[^\w-]/g, '')}`
}

function names(value: string): string[] {
  return value.split(',').map((name) => name.trim()).filter((name) => name !== '' && name !== 'none')
}

export function anchorRef<T extends HTMLElement>(property: AnchorProperty, name: string): RefCallback<T> {
  return (node) => {
    if (node === null) {
      return
    }

    if (property === 'position-anchor') {
      node.style.setProperty(property, name)
      return () => {
        node.style.removeProperty(property)
      }
    }

    const existing = names(node.style.getPropertyValue(property))
    if (!existing.includes(name)) {
      node.style.setProperty(property, [...existing, name].join(', '))
    }

    return () => {
      const remaining = names(node.style.getPropertyValue(property)).filter((candidate) => candidate !== name)
      if (remaining.length === 0) {
        node.style.removeProperty(property)
      } else {
        node.style.setProperty(property, remaining.join(', '))
      }
    }
  }
}
