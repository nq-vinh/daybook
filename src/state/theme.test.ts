import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeMediaQueryList } from '../../tests/unit/media-query'
import {
  getResolvedScheme,
  getThemePreference,
  initTheme,
  setThemePreference,
  subscribeTheme,
  useResolvedScheme,
} from './theme'

const systemDark = new FakeMediaQueryList('(prefers-color-scheme: dark)')

beforeAll(() => {
  window.matchMedia = () => systemDark
})

beforeEach(() => {
  systemDark.matches = false
  window.localStorage.clear()
  initTheme()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('theme store', () => {
  it('notifies subscribers when the system scheme changes in system mode', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTheme(listener)

    systemDark.setMatches(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    unsubscribe()
  })

  it('follows a theme stored by another tab', () => {
    window.localStorage.setItem('theme', 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }))
    expect(getThemePreference()).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'light' }))
    expect(getThemePreference()).toBe('dark')

    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }))
    expect(getThemePreference()).toBe('system')
  })

  it('falls back to system when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled.', 'SecurityError')
    })

    initTheme()
    expect(getThemePreference()).toBe('system')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('still applies a choice when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded.', 'QuotaExceededError')
    })

    setThemePreference('dark')
    expect(getThemePreference()).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})

describe('useResolvedScheme', () => {
  it('follows an explicit preference', () => {
    const { result } = renderHook(() => useResolvedScheme())
    expect(result.current).toBe('light')

    act(() => {
      setThemePreference('dark')
    })
    expect(result.current).toBe('dark')

    act(() => {
      setThemePreference('light')
    })
    expect(result.current).toBe('light')
  })

  it('follows the system scheme in system mode', () => {
    const { result } = renderHook(() => useResolvedScheme())

    act(() => {
      systemDark.setMatches(true)
    })
    expect(result.current).toBe('dark')
  })

  it('follows a theme stored by another tab', () => {
    const { result } = renderHook(() => useResolvedScheme())

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }))
    })
    expect(result.current).toBe('dark')
  })

  it('falls back to the system query before the theme is applied', () => {
    delete document.documentElement.dataset.theme
    systemDark.matches = true
    expect(getResolvedScheme()).toBe('dark')

    systemDark.matches = false
    expect(getResolvedScheme()).toBe('light')
  })
})
