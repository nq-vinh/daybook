import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RouterProvider } from '../router/router'
import { DesignPage } from './design'
import { componentId } from './design/section'
import { notFound, routes } from './routes'

const LAZY_TIMEOUT = { timeout: 10_000 }

const componentNames = Object.keys(import.meta.glob(['../ui/*/*.tsx', '!../ui/*/*.test.tsx']))
  .map((path) => path.split('/'))
  .filter(([, , folder, file]) => file === `${folder ?? ''}.tsx`)
  .map(([, , folder]) => folder ?? '')

async function renderLoaded() {
  const view = render(
    <RouterProvider routes={routes} notFound={notFound}>
      <DesignPage />
    </RouterProvider>,
  )
  const components = await screen.findByRole('heading', { level: 2, name: 'Components' }, LAZY_TIMEOUT)
  return { ...view, components }
}

describe('DesignPage', () => {
  it('renders one focusable h1 and never skips a heading level', async () => {
    const { container } = await renderLoaded()
    const levels = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'), (heading) => Number(heading.tagName.slice(1)))

    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1')
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)

    for (const [index, level] of levels.entries()) {
      expect(level, `heading ${String(index)}`).toBeLessThanOrEqual((levels[index - 1] ?? 0) + 1)
    }
  })

  it('links every h2 from the sections nav', async () => {
    await renderLoaded()
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const headings = screen.getAllByRole('heading', { level: 2 })

    expect(headings.map((heading) => heading.textContent)).toEqual(['Colour', 'Type', 'Space', 'Radius', 'Shadow', 'Motion', 'Layers', 'Components', 'Charts'])

    for (const heading of headings) {
      expect(nav.querySelector(`a[href="#${heading.id}"]`)).toHaveTextContent(heading.textContent)
    }
  })

  it('gives every component in src/ui its own h3 under Components', async () => {
    const { components } = await renderLoaded()

    expect(componentNames).toHaveLength(24)

    for (const name of componentNames) {
      const heading = document.getElementById(componentId(name))

      expect(heading, name).toHaveTextContent(name)
      expect(heading?.tagName, name).toBe('H3')
      expect(components.compareDocumentPosition(heading ?? components) & Node.DOCUMENT_POSITION_FOLLOWING, name).toBeTruthy()
    }
  })

  it('says unmeasured instead of guessing when the browser cannot resolve a colour', async () => {
    const { container } = await renderLoaded()
    const pairs = Array.from(container.querySelectorAll('tr[data-contrast-pair]'))

    expect(pairs).toHaveLength(30)

    for (const pair of pairs) {
      expect(pair).toHaveAttribute('data-ratio', 'unmeasured')
    }
  })
})
