import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Icon } from './Icon'

describe('Icon', () => {
  it('is hidden from assistive technology by default', () => {
    const { container } = render(<Icon name="check" />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '16')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('becomes a named image when labelled', () => {
    render(<Icon name="sun" size={20} label="Light theme" />)

    const image = screen.getByRole('img', { name: 'Light theme' })
    expect(image).not.toHaveAttribute('aria-hidden')
    expect(image).toHaveAttribute('width', '20')
  })
})
