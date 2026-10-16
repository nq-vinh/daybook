import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { canvasCalls, fakeResizeObserver } from '../../../tests/unit/canvas'
import { Sparkline } from './Sparkline'

describe('Sparkline', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is an image labelled by the caller', () => {
    render(<Sparkline points={[1, 3, 2]} label="30-day balance, from €1.00 to €2.00" />)

    expect(screen.getByRole('img', { name: '30-day balance, from €1.00 to €2.00' }).tagName).toBe('CANVAS')
  })

  it('draws a 2 px line and a dot at the last point once the draw-in has finished', async () => {
    vi.stubGlobal('ResizeObserver', fakeResizeObserver(120, 32))
    render(<Sparkline points={[1, 3, 2, 5]} label="Balance" />)
    const canvas = screen.getByRole('img')

    await waitFor(() => {
      expect(canvasCalls(canvas).filter((call) => call.name === 'arc')).toHaveLength(2)
    })

    const calls = canvasCalls(canvas)

    expect(calls).toContainEqual({ name: 'set lineWidth', args: [2] })
    expect(calls.filter((call) => call.name === 'lineTo')).toHaveLength(3)
    expect(calls.find((call) => call.name === 'arc')?.args.slice(0, 2)).toEqual([114, 6])
  })

  it('draws the line in over --duration-base before the dot appears', async () => {
    vi.stubGlobal('ResizeObserver', fakeResizeObserver(120, 32))
    const { container } = render(<Sparkline points={[1, 3, 2, 5]} label="Balance" />)
    container.style.setProperty('--duration-base', '200ms')
    const canvas = screen.getByRole('img')

    await waitFor(() => {
      expect(canvasCalls(canvas).filter((call) => call.name === 'arc')).toHaveLength(2)
    }, { timeout: 2_000 })

    const strokes = canvasCalls(canvas).filter((call) => call.name === 'stroke')

    expect(strokes.length).toBeGreaterThan(2)
  })
})
