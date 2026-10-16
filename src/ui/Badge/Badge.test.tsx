import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './Badge'

describe('Badge', () => {
  it('renders its text with the neutral tone by default', () => {
    render(<Badge>Pending</Badge>)

    expect(screen.getByText('Pending')).toHaveAttribute('data-tone', 'neutral')
  })

  it.each(['positive', 'negative', 'warning', 'accent'] as const)('carries the %s tone next to its text', (tone) => {
    render(<Badge tone={tone}>Declined</Badge>)

    expect(screen.getByText('Declined')).toHaveAttribute('data-tone', tone)
  })
})
