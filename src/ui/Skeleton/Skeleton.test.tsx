import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('renders a hidden block by default', () => {
    const { container } = render(<Skeleton />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild).toHaveAttribute('data-skeleton', 'block')
  })

  it('renders the requested number of text lines, hidden from assistive technology', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild?.children).toHaveLength(3)
  })
})
