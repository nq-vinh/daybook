import { afterEach, describe, expect, it, vi } from 'vitest'

import { measureGeometry, pageStep, viewport } from './virtual'

describe('pageStep', () => {
  it.each([
    { label: 'stuck header, rows not aligned', top: -9_000, stickyHeight: 36, height: 950, expected: 25 },
    { label: 'stuck header, rows aligned', top: -9_000, stickyHeight: 50, height: 950, expected: 24 },
    { label: 'no header, rows aligned', top: 0, stickyHeight: 0, height: 360, expected: 9 },
    { label: 'body below the viewport top', top: 300, stickyHeight: 300, height: 950, expected: 18 },
    { label: 'body below the fold', top: 1_200, stickyHeight: 0, height: 950, expected: 1 },
    { label: 'band shorter than a row', top: -9_000, stickyHeight: 930, height: 950, expected: 1 },
  ])('$label', ({ top, stickyHeight, height, expected }) => {
    expect(pageStep({ top, height, rowHeight: 36, stickyHeight })).toBe(expected)
  })
})

describe('measureGeometry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function measure(headBottom: number | null) {
    const body = document.createElement('tbody')
    const head = document.createElement('thead')
    vi.spyOn(viewport, 'height').mockReturnValue(900)
    vi.spyOn(viewport, 'top').mockReturnValue(-400)
    vi.spyOn(viewport, 'bottom').mockReturnValue(headBottom ?? 0)
    return measureGeometry(body, headBottom === null ? null : head, 36)
  }

  it.each([
    { label: 'a stuck header covers its own height', headBottom: 36, expected: 36 },
    { label: 'a header in its natural place covers down to its bottom', headBottom: 320, expected: 320 },
    { label: 'a header pushed above the viewport covers nothing', headBottom: -250, expected: 0 },
    { label: 'a header below the fold covers the whole viewport', headBottom: 1_400, expected: 900 },
    { label: 'no header covers nothing', headBottom: null, expected: 0 },
  ])('$label', ({ headBottom, expected }) => {
    expect(measure(headBottom)).toEqual({ top: -400, height: 900, rowHeight: 36, stickyHeight: expected })
  })
})
