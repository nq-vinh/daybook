import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar, avatarHue, initials } from './Avatar'

describe('Avatar', () => {
  it('takes the first letters of the first two words, uppercased', () => {
    expect(initials('kessler gmbh')).toBe('KG')
    expect(initials('  Northwind   Hosting Ltd ')).toBe('NH')
    expect(initials('Ölbaum')).toBe('Ö')
  })

  it('maps ids deterministically onto eight hues', () => {
    const hues = Array.from({ length: 200 }, (_, index) => avatarHue(`counterparty-${String(index)}`))

    expect(avatarHue('counterparty-7')).toBe(avatarHue('counterparty-7'))
    expect(new Set(hues).size).toBe(8)
    expect(hues.every((hue) => hue >= 1 && hue <= 8)).toBe(true)
  })

  it('is an image named by the full name', () => {
    render(<Avatar id="c-1" name="Kessler GmbH" />)

    const avatar = screen.getByRole('img', { name: 'Kessler GmbH' })
    expect(avatar).toHaveTextContent('KG')
    expect(avatar).toHaveAttribute('data-hue', String(avatarHue('c-1')))
  })

  it('hides itself when a visible name sits next to it', () => {
    render(<p><Avatar id="c-1" name="Kessler GmbH" decorative />Kessler GmbH</p>)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
