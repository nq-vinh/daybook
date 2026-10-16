import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app'
import { notFound, routes } from '../../src/pages/routes'
import { navigate } from '../../src/router/history'
import { matchPath, resolve } from '../../src/router/match'
import { Link } from '../../src/router/link'
import { RouterProvider } from '../../src/router/router'

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

    expect(screen.getByRole('status')).toHaveTextContent('Budgets')
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

  it('publishes only the latest location when view transitions overlap', () => {
    const pending: (() => void)[] = []
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        pending.push(update)
      },
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 480 })
    window.sessionStorage.removeItem('daybook:scroll')

    try {
      renderApp()

      navigate('/cards')
      const cardsKey = window.sessionStorage.getItem('daybook:history-seq') ?? ''
      navigate('/budgets')

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Overview')

      act(() => {
        for (const update of pending) {
          update()
        }
      })

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Budgets')
      expect(screen.getByRole('status')).toHaveTextContent('Budgets')

      expect(cardsKey).toMatch(/^\d+$/)
      expect(window.sessionStorage.getItem('daybook:scroll')).not.toContain(`["${cardsKey}",`)
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
      Reflect.deleteProperty(window, 'matchMedia')
      Reflect.deleteProperty(window, 'scrollY')

      if (originalScrollY !== undefined) {
        Object.defineProperty(window, 'scrollY', originalScrollY)
      }
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
    expect(screen.getByRole('status')).toHaveTextContent('Overview')
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
    const first = screen.getByRole('status').firstElementChild

    act(() => {
      navigate('/transactions/3')
    })
    const second = screen.getByRole('status').firstElementChild

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

    const announcement = screen.getByRole('status').firstElementChild
    const filterLink = screen.getByRole('link', { name: 'Overview' })
    filterLink.focus()
    scrollTo.mockClear()

    act(() => {
      navigate('/transactions?q=rent')
    })

    expect(window.location.search).toBe('?q=rent')
    expect(filterLink).toHaveFocus()
    expect(scrollTo).not.toHaveBeenCalled()
    expect(screen.getByRole('status').firstElementChild).toBe(announcement)
  })

  it('renders the not-found page for unknown paths', () => {
    navigate('/nowhere')
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })

  it('passes route params to the page', () => {
    navigate('/transactions/tx-42')
    renderApp()

    expect(screen.getByText('Details for transaction tx-42 will appear here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })
})
