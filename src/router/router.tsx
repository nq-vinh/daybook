import { createContext, use, useEffect, useSyncExternalStore, type ReactNode } from 'react'

import { getLocation, subscribe, type RouteLocation } from './history'
import { resolve, type Route, type RouteMatch } from './match'

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
    }
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
  const { route, params } = useRoute()
  const Page = route.component

  return <Page params={params} />
}
