import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app'
import { notFound, routes } from '../../src/pages/routes'
import { getLocation, navigate } from '../../src/router/history'
import { matchPath, resolve } from '../../src/router/match'
import { Link } from '../../src/router/link'
import { RouterProvider } from '../../src/router/router'

vi.mock('../../src/worker/client', async () => {
  const { sharedLedgerClient } = await import('./fake-ledger-client')
  return { ledgerClient: sharedLedgerClient.client }
})

function clickDefaultPrevented(element: HTMLElement, init: MouseEventInit = {}): boolean {
  let defaultPrevented = true
  const recordDefault = (event: MouseEvent) => {
    defaultPrevented = event.defaultPrevented
    event.preventDefault()
  }
  window.addEventListener('click', recordDefault)
  fireEvent.click(element, init)
  window.removeEventListener('click', recordDefault)
  return defaultPrevented
}

function announcer(): HTMLElement {
  const region = screen.getAllByRole('status').find((element) => !element.hasAttribute('aria-label'))

  if (region === undefined) {
    throw new Error('The route announcer is not rendered.')
  }

  return region
}

function stubReportError() {
  const reportError = vi.fn<(error: unknown) => void>()
  Object.defineProperty(window, 'reportError', { configurable: true, value: reportError })
  return reportError
}

function renderApp() {
  return render(
    <RouterProvider routes={routes} notFound={notFound}>
      <App />
    </RouterProvider>,
  )
}

describe('matchPath', () => {
  it('matches static paths and ignores trailing slashes', () => {
    expect(matchPath('/', '/')).toEqual({})
    expect(matchPath('/cards', '/cards/')).toEqual({})
    expect(matchPath('/cards', '/budgets')).toBeNull()
  })

  it('captures and decodes params', () => {
    expect(matchPath('/transactions/:id', '/transactions/tx%2042')).toEqual({ id: 'tx 42' })
  })

  it('rejects paths with a different segment count', () => {
    expect(matchPath('/transactions/:id', '/transactions')).toBeNull()
    expect(matchPath('/transactions/:id', '/transactions/1/edit')).toBeNull()
  })

  it('treats malformed escapes as no match', () => {
    expect(matchPath('/transactions/:id', '/transactions/%')).toBeNull()
    expect(resolve(routes, notFound, '/transactions/%').route).toBe(notFound)
  })

  it('falls back to the not-found route', () => {
    expect(resolve(routes, notFound, '/nowhere').route).toBe(notFound)
    expect(resolve(routes, notFound, '/transactions/7').params).toEqual({ id: '7' })
  })
})

describe('router', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    navigate('/')
  })

  it('navigates on a plain left click and moves focus to the page heading', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('link', { name: 'Transactions' }))

    const heading = screen.getByRole('heading', { level: 1, name: 'Transactions' })
    expect(window.location.pathname).toBe('/transactions')
    expect(heading).toHaveFocus()
    expect(document.title).toBe('Transactions - Daybook')
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('announces the new page title politely', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('link', { name: 'Budgets' }))

    expect(announcer()).toHaveTextContent('Budgets')
  })

  it('leaves modified and non-primary clicks to the browser', () => {
    renderApp()
    const cards = screen.getByRole('link', { name: 'Cards' })

    expect(clickDefaultPrevented(cards, { ctrlKey: true })).toBe(false)
    expect(clickDefaultPrevented(cards, { button: 1 })).toBe(false)
    expect(window.location.pathname).toBe('/')
  })

  it('leaves new-tab, download and cross-origin links to the browser', () => {
    render(
      <RouterProvider routes={routes} notFound={notFound}>
        <Link to="/cards" target="_blank">New tab</Link>
        <Link to="/export.csv" download>Download</Link>
        <Link to="https://example.com/cards">Elsewhere</Link>
        <Link to="mailto:finance@example.com">Mail</Link>
      </RouterProvider>,
    )

    for (const name of ['New tab', 'Download', 'Elsewhere', 'Mail']) {
      expect(clickDefaultPrevented(screen.getByRole('link', { name })), name).toBe(false)
    }
    expect(window.location.pathname).toBe('/')
  })

  it('leaves same-page hash links to the browser', () => {
    render(
      <RouterProvider routes={routes} notFound={notFound}>
        <Link to="#ledger">Ledger section</Link>
        <Link to="/#ledger">Ledger section by path</Link>
      </RouterProvider>,
    )

    for (const name of ['Ledger section', 'Ledger section by path']) {
      expect(clickDefaultPrevented(screen.getByRole('link', { name })), name).toBe(false)
    }
    expect(window.location.pathname).toBe('/')
  })

  it('keys history entries with a per-session counter', () => {
    navigate('/cards')
    const first = window.sessionStorage.getItem('daybook:history-seq')
    const firstState: unknown = window.history.state

    navigate('/budgets')
    const secondState: unknown = window.history.state

    expect(first).toMatch(/^\d+$/)
    expect(firstState).toEqual({ key: first })
    expect(secondState).toEqual({ key: String(Number(first) + 1) })
    expect(window.sessionStorage.getItem('daybook:history-seq')).toBe(String(Number(first) + 1))
  })

  it('publishes only the latest location when view transitions overlap', async () => {
    const pending: (() => void)[] = []
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        pending.push(update)
        return {
          ready: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
          finished: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => undefined,
        }
      },
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 480 })
    window.sessionStorage.removeItem('daybook:scroll')
    const reportError = stubReportError()

    try {
      renderApp()
      const before = screen.getByRole('heading', { level: 1 }).textContent

      const cardsKey = 'popped-cards'
      window.history.pushState({ key: cardsKey }, '', '/cards')
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.history.pushState({ key: 'popped-budgets' }, '', '/budgets')
      window.dispatchEvent(new PopStateEvent('popstate'))

      expect(pending).toHaveLength(2)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(before)

      act(() => {
        for (const update of pending) {
          update()
        }
      })

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Budgets')
      expect(announcer()).toHaveTextContent('Budgets')

      expect(window.sessionStorage.getItem('daybook:scroll')).not.toContain(`["${cardsKey}",`)
      await Promise.resolve()
      expect(reportError).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
      Reflect.deleteProperty(window, 'matchMedia')
      Reflect.deleteProperty(window, 'reportError')
      Reflect.deleteProperty(window, 'scrollY')

      if (originalScrollY !== undefined) {
        Object.defineProperty(window, 'scrollY', originalScrollY)
      }
    }
  })

  it('publishes interaction-driven navigations directly without a view transition', () => {
    const startViewTransition = vi.fn()
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })

    try {
      renderApp()
      act(() => {
        navigate('/cards')
      })

      expect(startViewTransition).not.toHaveBeenCalled()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cards')
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
      Reflect.deleteProperty(window, 'matchMedia')
    }
  })

  it('reports a failed view transition update instead of swallowing it', async () => {
    const failure = new Error('listener failed')
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        update()
        return {
          ready: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
          finished: Promise.reject(failure),
          updateCallbackDone: Promise.reject(failure),
          skipTransition: () => undefined,
        }
      },
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })
    const reportError = stubReportError()

    try {
      renderApp()
      act(() => {
        window.history.pushState({ key: 'popped-failure' }, '', '/cards')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })

      await waitFor(() => {
        expect(reportError).toHaveBeenCalledWith(failure)
      })
      expect(reportError).not.toHaveBeenCalledWith(expect.any(DOMException))
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
      Reflect.deleteProperty(window, 'matchMedia')
      Reflect.deleteProperty(window, 'reportError')
    }
  })

  it('restores the remembered scroll on a same-path popstate to another entry', async () => {
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const setScrollY = (value: number) => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value })
    }

    try {
      navigate('/cards')
      renderApp()
      scrollTo.mockClear()

      setScrollY(480)
      act(() => {
        navigate('/cards?view=frozen')
      })
      expect(scrollTo).not.toHaveBeenCalled()

      setScrollY(120)
      act(() => {
        window.history.back()
      })
      await waitFor(() => {
        expect(window.location.search).toBe('')
      })
      await waitFor(() => {
        expect(scrollTo).toHaveBeenLastCalledWith(0, 480)
      })

      act(() => {
        window.history.forward()
      })
      await waitFor(() => {
        expect(scrollTo).toHaveBeenLastCalledWith(0, 120)
      })
      expect(window.location.search).toBe('?view=frozen')
    } finally {
      Reflect.deleteProperty(window, 'scrollY')

      if (originalScrollY !== undefined) {
        Object.defineProperty(window, 'scrollY', originalScrollY)
      }
    }
  })

  async function restoreAfterBack(scrollHeight: { value: number }) {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    navigate('/cards')
    renderApp()
    scrollTo.mockClear()
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 5_000 })
    act(() => {
      navigate('/cards?view=frozen')
    })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    scrollHeight.value = 1_000
    act(() => {
      window.history.back()
    })
    await waitFor(() => {
      expect(scrollTo).toHaveBeenLastCalledWith(0, 5_000)
    })
    return scrollTo
  }

  function withScrollHold(run: (grow: (height: number) => void, scrollHeight: { value: number }) => Promise<void>) {
    return async () => {
      const callbacks: (() => void)[] = []
      vi.stubGlobal('ResizeObserver', class {
        constructor(callback: () => void) {
          callbacks.push(callback)
        }

        observe = () => undefined
        unobserve = () => undefined
        disconnect = () => {
          callbacks.length = 0
        }
      })
      const scrollHeight = { value: 0 }
      Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => scrollHeight.value })
      const grow = (height: number) => {
        scrollHeight.value = height
        for (const callback of [...callbacks]) {
          callback()
        }
      }

      try {
        await run(grow, scrollHeight)
      } finally {
        vi.unstubAllGlobals()
        Reflect.deleteProperty(document.documentElement, 'scrollHeight')
        Reflect.deleteProperty(window, 'scrollY')
      }
    }
  }

  it('re-applies a remembered scroll once when the document grows to hold it', withScrollHold(async (grow, scrollHeight) => {
    const scrollTo = await restoreAfterBack(scrollHeight)
    const restores = () => scrollTo.mock.calls.filter(([, top]) => top === 5_000).length

    grow(3_000)
    expect(restores()).toBe(1)
    grow(6_000)
    expect(restores()).toBe(2)
    grow(9_000)
    expect(restores()).toBe(2)
  }))

  it('stops holding a remembered scroll when the user scrolls', withScrollHold(async (grow, scrollHeight) => {
    const scrollTo = await restoreAfterBack(scrollHeight)

    window.dispatchEvent(new WheelEvent('wheel'))
    grow(6_000)

    expect(scrollTo.mock.calls.filter(([, top]) => top === 5_000)).toHaveLength(1)
  }))

  it('keeps the location key on the current entry after a same-URL popstate and a replace', () => {
    navigate('/cards')
    renderApp()
    const before = getLocation().key

    act(() => {
      window.history.pushState(null, '', '/cards#details')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    const afterPopstate: unknown = window.history.state

    expect(getLocation().key).not.toBe(before)
    expect(afterPopstate).toEqual({ key: getLocation().key })

    act(() => {
      navigate('/cards?view=frozen', { replace: true })
    })
    const afterReplace: unknown = window.history.state

    expect(afterReplace).toEqual({ key: getLocation().key })
  })

  it('drops a pending search write once the browser has left the ledger', async () => {
    navigate('/transactions')
    const user = userEvent.setup()
    renderApp()
    stubReportError()
    const pending: (() => void)[] = []
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        pending.push(update)
        return {
          ready: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
          finished: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => undefined,
        }
      },
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })

    try {
      await user.type(screen.getByRole('searchbox', { name: 'Search transactions' }), 'ab')
      navigate('/cards')
      const length = window.history.length

      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 300)
        })
      })

      expect(window.location.pathname).toBe('/cards')
      expect(window.history.length).toBe(length)
    } finally {
      act(() => {
        for (const update of pending) {
          update()
        }
      })
      Reflect.deleteProperty(document, 'startViewTransition')
      Reflect.deleteProperty(window, 'matchMedia')
      Reflect.deleteProperty(window, 'reportError')
    }
  })

  it('restores the previous page on popstate', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('link', { name: 'Cards' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cards')

    act(() => {
      window.history.back()
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Overview')
    })
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(announcer()).toHaveTextContent('Overview')
  })

  it('replaces the current entry when asked', () => {
    renderApp()
    const length = window.history.length

    act(() => {
      navigate('/cards', { replace: true })
    })

    expect(window.history.length).toBe(length)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cards')
  })

  it('re-announces when two routes share a title', () => {
    navigate('/transactions/1')
    renderApp()

    act(() => {
      navigate('/transactions/2')
    })
    const first = announcer().firstElementChild

    act(() => {
      navigate('/transactions/3')
    })
    const second = announcer().firstElementChild

    expect(second).toHaveTextContent('Transaction')
    expect(second).not.toBe(first)
  })

  it('moves focus, scrolls and announces only when the pathname changes', () => {
    renderApp()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)

    act(() => {
      navigate('/transactions')
    })
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)

    const announcement = announcer().firstElementChild
    const filterLink = screen.getByRole('link', { name: 'Overview' })
    filterLink.focus()
    scrollTo.mockClear()

    act(() => {
      navigate('/transactions?q=rent')
    })

    expect(window.location.search).toBe('?q=rent')
    expect(filterLink).toHaveFocus()
    expect(scrollTo).not.toHaveBeenCalled()
    expect(announcer().firstElementChild).toBe(announcement)
  })

  it('renders the not-found page for unknown paths', () => {
    navigate('/nowhere')
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })

  it('passes route params to the page', () => {
    navigate('/transactions/42')
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Transaction' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it.each(['tx-42', '-1', '042', '1.5', '100000', '%34%32'])('renders the not found state and title for the transaction id %s', (id) => {
    navigate(`/transactions/${id}`)
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(document.title).toBe('Page not found - Daybook')
  })
})
