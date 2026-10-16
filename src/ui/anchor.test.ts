import { describe, expect, it } from 'vitest'

import { anchorName, anchorRef } from './anchor'

describe('anchorRef', () => {
  it('derives a dashed ident from a React id', () => {
    expect(anchorName('menu', '_r_1_')).toBe('--menu-_r_1_')
    expect(anchorName('menu', '«r1»')).toBe('--menu-r1')
  })

  it('appends to an existing anchor-name list and removes only its own name', () => {
    const node = document.createElement('button')
    node.style.setProperty('anchor-name', '--other')

    const cleanupMenu = anchorRef<HTMLButtonElement>('anchor-name', '--menu-a')(node)
    const cleanupTooltip = anchorRef<HTMLButtonElement>('anchor-name', '--tooltip-a')(node)
    expect(node.style.getPropertyValue('anchor-name')).toBe('--other, --menu-a, --tooltip-a')

    if (typeof cleanupMenu === 'function') {
      cleanupMenu()
    }
    expect(node.style.getPropertyValue('anchor-name')).toBe('--other, --tooltip-a')

    if (typeof cleanupTooltip === 'function') {
      cleanupTooltip()
    }
    expect(node.style.getPropertyValue('anchor-name')).toBe('--other')
  })
})
