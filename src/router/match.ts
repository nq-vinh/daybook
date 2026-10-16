import type { ComponentType } from 'react'

export type Params = Readonly<Record<string, string>>

export interface Route {
  readonly path: string
  readonly title: string
  readonly component: ComponentType<{ params: Params }>
  readonly accept?: ((params: Params, pathname: string) => boolean) | undefined
}

export interface RouteMatch {
  readonly route: Route
  readonly params: Params
}

function segments(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '')
}

export function matchPath(pattern: string, pathname: string): Params | null {
  const patternSegments = segments(pattern)
  const pathSegments = segments(pathname)

  if (patternSegments.length !== pathSegments.length) {
    return null
  }

  const params: Record<string, string> = {}

  for (const [index, patternSegment] of patternSegments.entries()) {
    const pathSegment = pathSegments[index] ?? ''

    if (patternSegment.startsWith(':')) {
      try {
        params[patternSegment.slice(1)] = decodeURIComponent(pathSegment)
      } catch {
        return null
      }
    } else if (patternSegment !== pathSegment) {
      return null
    }
  }

  return params
}

export function resolve(routes: readonly Route[], notFound: Route, pathname: string): RouteMatch {
  for (const route of routes) {
    const params = matchPath(route.path, pathname)

    if (params !== null && (route.accept?.(params, pathname) ?? true)) {
      return { route, params }
    }
  }

  return { route: notFound, params: {} }
}
