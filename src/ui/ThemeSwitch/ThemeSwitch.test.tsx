import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { initTheme, setThemePreference } from '../../state/theme'
import { FakeMediaQueryList } from '../../../tests/unit/media-query'
import { ThemeSwitch } from './ThemeSwitch'

const systemDark = new FakeMediaQueryList('(prefers-color-scheme: dark)')

beforeAll(() => {
  window.matchMedia = () => systemDark
})

beforeEach(() => {
  systemDark.matches = false
  act(() => {
    setThemePreference('system')
  })
  window.localStorage.clear()
})

describe('ThemeSwitch', () => {
  it('renders a radiogroup named Theme with the current preference checked', () => {
    render(<ThemeSwitch />)

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['system', 'light', 'dark'])
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
  })

  it('persists the selection and applies data-theme', async () => {
    const user = userEvent.setup()
    render(<ThemeSwitch />)

    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(window.localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('tabs to the checked radio and moves selection with arrow keys', async () => {
    const user = userEvent.setup()
    act(() => {
      setThemePreference('light')
    })
    render(<ThemeSwitch />)

    await user.tab()
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveFocus()
    expect(window.localStorage.getItem('theme')).toBe('dark')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(window.localStorage.getItem('theme')).toBe('system')
  })

  it('is a single Tab stop', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ThemeSwitch />
        <button type="button">After</button>
      </>,
    )

    await user.tab()
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus()
  })

  it('follows the system scheme only in system mode', () => {
    render(<ThemeSwitch />)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')

    act(() => {
      systemDark.setMatches(true)
    })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    act(() => {
      setThemePreference('light')
    })
    act(() => {
      systemDark.setMatches(false)
      systemDark.setMatches(true)
    })
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('restores the stored preference on start', () => {
    window.localStorage.setItem('theme', 'dark')
    act(() => {
      initTheme()
    })
    render(<ThemeSwitch />)

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    window.localStorage.setItem('theme', 'sepia')
    act(() => {
      initTheme()
    })
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})
