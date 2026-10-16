import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type ScrollAxis, ScrollRegion } from './ScrollRegion'

const observers = new Set<ResizeObserverStub>()

class ResizeObserverStub implements ResizeObserver {
  readonly #callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback
    observers.add(this)
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {
    observers.delete(this)
  }

  trigger(): void {
    this.#callback([], this)
  }
}

const SIZES = {
  inline: ['scrollWidth', 'clientWidth'],
  block: ['scrollHeight', 'clientHeight'],
} as const satisfies Record<ScrollAxis, readonly [string, string]>

function resize(element: Element, axis: ScrollAxis, content: number, box: number): void {
  const [scroll, client] = SIZES[axis]
  Object.defineProperty(element, scroll, { configurable: true, value: content })
  Object.defineProperty(element, client, { configurable: true, value: box })
  act(() => {
    for (const observer of observers) {
      observer.trigger()
    }
  })
}

function wrapper(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>('[data-scroll-region]')
  if (found === null) {
    throw new Error('No scroll region wrapper')
  }
  return found
}

beforeEach(() => {
  observers.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(['inline', 'block'] as const)('ScrollRegion on the %s axis', (axis) => {
  it('is a labelled region with a tab stop only while its content overflows', () => {
    const { container } = render(<ScrollRegion axis={axis} label="Sample, scrolls"><p>Content</p></ScrollRegion>)
    const element = wrapper(container)
    expect(element).not.toHaveAttribute('role')
    expect(element).not.toHaveAttribute('tabindex')

    resize(element, axis, 400, 200)
    expect(screen.getByRole('region', { name: 'Sample, scrolls' })).toBe(element)
    expect(element).toHaveAttribute('tabindex', '0')

    resize(element, axis, 200, 200)
    expect(element).not.toHaveAttribute('role')
    expect(element).not.toHaveAttribute('aria-label')
    expect(element).not.toHaveAttribute('tabindex')
  })

  it('keeps its tab stop while focused after the overflow ends, and drops it on blur', () => {
    const { container } = render(<ScrollRegion axis={axis} label="Sample, scrolls"><p>Content</p></ScrollRegion>)
    const element = wrapper(container)
    resize(element, axis, 400, 200)
    act(() => {
      element.focus()
    })

    resize(element, axis, 200, 200)
    expect(element).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Sample, scrolls' })).toHaveAttribute('tabindex', '0')

    act(() => {
      element.blur()
    })
    expect(element).not.toHaveAttribute('role')
    expect(element).not.toHaveAttribute('tabindex')
  })
})

describe('ScrollRegion', () => {
  it('takes its name from labelledBy', () => {
    const { container } = render(
      <>
        <h2 id="caption">Ledger sample</h2>
        <ScrollRegion labelledBy="caption"><p>Content</p></ScrollRegion>
      </>,
    )
    resize(wrapper(container), 'inline', 400, 200)
    expect(screen.getByRole('region', { name: 'Ledger sample' })).toBe(wrapper(container))
  })
})
