import { flushSync } from 'react-dom'

export interface RouteLocation {
  readonly pathname: string
  readonly search: string
  readonly navigations: number
  readonly pathnameChanged: boolean
  readonly scrollY: number | null
  readonly fragment: string | null
}

const SCROLL_STORAGE_KEY = 'daybook:scroll'
const SEQUENCE_STORAGE_KEY = 'daybook:history-seq'
const MAX_REMEMBERED_ENTRIES = 50

const listeners = new Set<() => void>()
const scrollPositions = readScrollPositions()

let sequence = 0

function readStoredSequence(): number {
  try {
    const stored = Number(window.sessionStorage.getItem(SEQUENCE_STORAGE_KEY))
    return Number.isSafeInteger(stored) ? stored : 0
  } catch {
    return 0
  }
}

function nextKey(): string {
  sequence = Math.max(sequence, readStoredSequence()) + 1

  try {
    window.sessionStorage.setItem(SEQUENCE_STORAGE_KEY, String(sequence))
  } catch {
    return String(sequence)
  }

  return String(sequence)
}

function readKey(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'key' in state && typeof state.key === 'string') {
    return state.key
  }

  return null
}

function ensureKey(): string {
  const existing = readKey(window.history.state)

  if (existing !== null) {
    return existing
  }

  const key = nextKey()
  window.history.replaceState({ key }, '')
  return key
}

function readScrollPositions(): Map<string, number> {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(SCROLL_STORAGE_KEY) ?? '[]')

    if (Array.isArray(stored)) {
      return new Map(stored.filter((entry): entry is [string, number] => (
        Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number'
      )))
    }
  } catch {
    return new Map()
  }

  return new Map()
}

function rememberScroll(key: string): void {
  if (snapshot !== latest) {
    return
  }

  scrollPositions.delete(key)
  scrollPositions.set(key, window.scrollY)

  for (const oldest of scrollPositions.keys()) {
    if (scrollPositions.size <= MAX_REMEMBERED_ENTRIES) {
      break
    }

    scrollPositions.delete(oldest)
  }

  try {
    window.sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify([...scrollPositions]))
  } catch {
    return
  }
}

let currentKey = ensureKey()
let navigations = 0
let latest: RouteLocation = {
  pathname: window.location.pathname,
  search: window.location.search,
  navigations,
  pathnameChanged: false,
  scrollY: scrollPositions.get(currentKey) ?? null,
  fragment: null,
}
let snapshot = latest

window.history.scrollRestoration = 'manual'

function publish(): void {
  if (snapshot === latest) {
    return
  }

  snapshot = latest
  for (const listener of listeners) {
    listener()
  }
}

function commit(scrollY: number, fragment: string | null = null): void {
  const pathnameChanged = window.location.pathname !== latest.pathname

  if (pathnameChanged) {
    navigations += 1
  }

  latest = {
    pathname: window.location.pathname,
    search: window.location.search,
    navigations,
    pathnameChanged,
    scrollY: pathnameChanged ? scrollY : null,
    fragment: pathnameChanged ? fragment : null,
  }

  if (!pathnameChanged || !('startViewTransition' in document)
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    publish()
    return
  }

  const transition = document.startViewTransition(() => {
    flushSync(publish)
  })
  for (const settled of [transition.ready, transition.finished, transition.updateCallbackDone]) {
    Promise.resolve(settled).catch(() => undefined)
  }
}

window.addEventListener('popstate', () => {
  rememberScroll(currentKey)
  currentKey = ensureKey()

  if (window.location.pathname === latest.pathname && window.location.search === latest.search) {
    return
  }

  commit(scrollPositions.get(currentKey) ?? 0)
})

window.addEventListener('pagehide', () => {
  rememberScroll(ensureKey())
})

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLocation(): RouteLocation {
  return snapshot
}

export function navigate(to: string, { replace = false }: { readonly replace?: boolean } = {}): void {
  const url = new URL(to, window.location.href)

  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return
  }

  if (replace) {
    window.history.replaceState({ key: ensureKey() }, '', url)
  } else {
    rememberScroll(ensureKey())
    currentKey = nextKey()
    window.history.pushState({ key: currentKey }, '', url)
  }

  commit(0, url.hash === '' ? null : url.hash.slice(1))
}
