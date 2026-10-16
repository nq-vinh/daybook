import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Hud, HudPanel } from './Hud'

describe('Hud', () => {
  it('is a region labelled Performance with four rows and units', () => {
    render(<HudPanel locale="en-GB" metrics={{ worstInteraction: 23.6, longTaskCount: 2, longTaskTotal: 131, domNodes: 1_482, drawRate: 59.7, supported: { event: true, longtask: true } }} />)
    const region = screen.getByRole('region', { name: 'Performance' })
    const terms = within(region).getAllByRole('term').map((term) => term.textContent)
    const values = within(region).getAllByRole('definition').map((value) => value.textContent)

    expect(terms).toEqual(['Worst interaction', 'Long tasks', 'DOM nodes', 'Chart draw rate'])
    expect(values).toEqual(['24 ms', '2 (131 ms)', '1,482', '60 fps'])
  })

  it('says what has not been measured yet', () => {
    const empty = { worstInteraction: null, longTaskCount: 0, longTaskTotal: 0, domNodes: null, drawRate: null }
    const { rerender } = render(<HudPanel locale="en-GB" metrics={{ ...empty, supported: { event: true, longtask: true } }} />)

    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual(['None yet', '0 (0 ms)', 'Not sampled', 'Not measured'])

    rerender(<HudPanel locale="en-GB" metrics={{ ...empty, supported: { event: false, longtask: false } }} />)

    expect(screen.getAllByRole('definition').map((value) => value.textContent).slice(0, 2)).toEqual(['Not supported', 'Not supported'])
  })

  it('marks the document while open so toasts can clear it, and unmarks it when closed', () => {
    const { unmount } = render(<Hud />)

    expect(document.documentElement).toHaveAttribute('data-hud-open')
    expect(document.documentElement.style.getPropertyValue('--hud-height')).toMatch(/^\d+px$/)

    unmount()

    expect(document.documentElement).not.toHaveAttribute('data-hud-open')
    expect(document.documentElement.style.getPropertyValue('--hud-height')).toBe('')
  })
})
