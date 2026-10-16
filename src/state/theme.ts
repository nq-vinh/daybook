import { useSyncExternalStore } from 'react'

const THEME_PREFERENCES = ['system', 'light', 'dark'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export type ResolvedScheme = 'light' | 'dark'

const STORAGE_KEY = 'theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const listeners = new Set<() => void>()

let preference: ThemePreference = 'system'
let systemQuery: MediaQueryList | null = null

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((candidate) => candidate === value)
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function storePreference(next: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    return
  }
}

function getSystemQuery(): MediaQueryList {
  systemQuery ??= window.matchMedia(DARK_QUERY)
  return systemQuery
}

function applyTheme(): void {
  const query = getSystemQuery()

  if (preference === 'system') {
    document.documentElement.dataset.theme = query.matches ? 'dark' : 'light'
    query.addEventListener('change', handleSystemChange)
  } else {
    document.documentElement.dataset.theme = preference
    query.removeEventListener('change', handleSystemChange)
  }
}

function commit(next: ThemePreference): void {
  preference = next
  applyTheme()

  for (const listener of listeners) {
    listener()
  }
}

function handleSystemChange(): void {
  commit(preference)
}

function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY || event.key === null) {
    commit(isThemePreference(event.newValue) ? event.newValue : 'system')
  }
}

export function initTheme(): void {
  window.addEventListener('storage', handleStorage)
  commit(readStoredPreference())
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getThemePreference(): ThemePreference {
  return preference
}

export function setThemePreference(next: ThemePreference): void {
  storePreference(next)
  commit(next)
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, getThemePreference)
}

export function getResolvedScheme(): ResolvedScheme {
  const applied = document.documentElement.dataset.theme

  if (applied === 'light' || applied === 'dark') {
    return applied
  }

  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function useResolvedScheme(): ResolvedScheme {
  return useSyncExternalStore(subscribeTheme, getResolvedScheme)
}
