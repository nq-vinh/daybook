import type { ComponentPropsWithoutRef, MouseEvent } from 'react'

import { navigate } from './history'

interface LinkProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  readonly to: string
}

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)

    const url = new URL(to, window.location.href)
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    const otherTarget = rest.target !== undefined && rest.target !== '_self'
    const external = url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)
    const hashOnly = url.hash !== '' && url.pathname === window.location.pathname
      && url.search === window.location.search

    if (event.defaultPrevented || event.button !== 0 || modified || otherTarget
      || rest.download !== undefined || external || hashOnly) {
      return
    }

    event.preventDefault()
    navigate(to)
  }

  return (
    <a {...rest} href={to} onClick={handleClick}>
      {children}
    </a>
  )
}
