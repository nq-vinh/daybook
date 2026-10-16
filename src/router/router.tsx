import { createContext, use, useEffect, useSyncExternalStore, type ReactNode } from 'react'

import { ErrorBoundary } from './ErrorBoundary'
import { getLocation, subscribe, type RouteLocation } from './history'
import { resolve, type Route, type RouteMatch } from './match'

const SCROLL_HOLD_MS = 1_000
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown'] as const

function canReach(scrollY: number): boolean {
  return document.documentElement.scrollHeight - window.innerHeight >= scrollY
}

function holdScroll(scrollY: number): (() => void) | undefined {
  if (canReach(scrollY) || typeof ResizeObserver === 'undefined') {
    return undefined
  }

  const observer = new ResizeObserver(() => {
    if (canReach(scrollY)) {
      window.scrollTo(0, scrollY)
      release()
    }
  })
  const timer = window.setTimeout(release, SCROLL_HOLD_MS)

  function release() {
    observer.disconnect()
    window.clearTimeout(timer)
    for (const type of USER_SCROLL_EVENTS) {
      window.removeEventListener(type, release)
    }
  }

  observer.observe(document.body)
  for (const type of USER_SCROLL_EVENTS) {
    window.addEventListener(type, release, { passive: true })
  }
  return release
}

interface RouterState extends RouteMatch {
  readonly location: RouteLocation
}

const RouterContext = createContext<RouterState | null>(null)

interface RouterProviderProps {
  readonly routes: readonly Route[]
  readonly notFound: Route
  readonly children: ReactNode
}

export function RouterProvider({ routes, notFound, children }: RouterProviderProps) {
  const location = useSyncExternalStore(subscribe, getLocation)
  const match = resolve(routes, notFound, location.pathname)

  useEffect(() => {
    document.title = `${match.route.title} - Daybook`

    if (location.pathnameChanged) {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
    }

    const fragmentTarget = location.fragment === null ? null : document.getElementById(location.fragment)

    if (fragmentTarget !== null) {
      fragmentTarget.scrollIntoView()
    } else if (location.scrollY !== null) {
      window.scrollTo(0, location.scrollY)
      return holdScroll(location.scrollY)
    }
    return undefined
  }, [location, match.route.title])

  return <RouterContext value={{ ...match, location }}>{children}</RouterContext>
}

export function useRoute(): RouterState {
  const state = use(RouterContext)

  if (state === null) {
    throw new Error('useRoute must be used inside RouterProvider.')
  }

  return state
}

export function RouteOutlet() {
  const { route, params, location } = useRoute()
  const Page = route.component

  return (
    <ErrorBoundary pathname={location.pathname}>
      <Page params={params} />
    </ErrorBoundary>
  )
}
