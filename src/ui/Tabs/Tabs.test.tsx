import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Tabs, type TabItem } from './Tabs'

const items: TabItem[] = [
  { id: 'month', label: 'This month', content: <p>Month summary</p> },
  { id: 'quarter', label: 'Quarter', content: <button type="button">Export quarter</button> },
  { id: 'year', label: 'Year', content: <p>Year summary</p> },
]

describe('Tabs', () => {
  it('wires tabs and panels with ARIA and shows the first panel', () => {
    render(<Tabs label="Period" items={items} />)

    expect(screen.getByRole('tablist', { name: 'Period' })).toBeInTheDocument()
    const tab = screen.getByRole('tab', { name: 'This month' })
    const panel = screen.getByRole('tabpanel', { name: 'This month' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveTextContent('Month summary')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getAllByRole('tab').map((candidate) => candidate.tabIndex)).toEqual([0, -1, -1])
  })

  it('activates automatically with arrows, wraps, and supports Home and End', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Period" items={items} />)

    await user.tab()
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Quarter' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Quarter' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Export quarter')
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Year' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Year' })).toHaveAttribute('aria-selected', 'true')
  })

  it('skips a disabled tab with arrows and never selects it', async () => {
    const user = userEvent.setup()
    const withDisabled = items.map((item) => (item.id === 'quarter' ? { ...item, disabled: true } : item))
    render(<Tabs label="Period" items={withDisabled} defaultValue="quarter" />)

    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Quarter' })).toBeDisabled()
    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Year' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Year' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveFocus()
  })

  it('selects the first enabled tab when a controlled value points at a disabled one', () => {
    const onValueChange = vi.fn<(value: string) => void>()
    const withDisabled = items.map((item) => (item.id === 'quarter' ? { ...item, disabled: true } : item))
    render(<Tabs label="Period" items={withDisabled} value="quarter" onValueChange={onValueChange} />)

    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Quarter' })).toHaveAttribute('aria-selected', 'false')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('keeps focus in place when every other tab is disabled', async () => {
    const user = userEvent.setup()
    const onlyQuarter = items.map((item) => (item.id === 'quarter' ? item : { ...item, disabled: true }))
    render(<Tabs label="Period" items={onlyQuarter} />)

    await user.tab()
    const quarter = screen.getByRole('tab', { name: 'Quarter' })
    expect(quarter).toHaveFocus()

    for (const key of ['{ArrowRight}', '{ArrowLeft}', '{Home}', '{End}']) {
      await user.keyboard(key)
      expect(quarter, key).toHaveFocus()
      expect(quarter, key).toHaveAttribute('aria-selected', 'true')
    }
  })

  it('moves Home and End to the nearest enabled tab when an edge tab is disabled', async () => {
    const user = userEvent.setup()
    const edgesDisabled: TabItem[] = [
      { id: 'month', label: 'This month', content: <p>Month summary</p>, disabled: true },
      { id: 'quarter', label: 'Quarter', content: <p>Quarter summary</p> },
      { id: 'half', label: 'Half year', content: <p>Half year summary</p> },
      { id: 'year', label: 'Year', content: <p>Year summary</p>, disabled: true },
    ]
    render(<Tabs label="Period" items={edgesDisabled} />)

    await user.tab()
    expect(screen.getByRole('tab', { name: 'Quarter' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Half year' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Half year' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Quarter' })).toHaveFocus()
  })

  it('makes a panel focusable only when it has no focusable child', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Period" items={items} defaultValue="quarter" />)

    expect(screen.getByRole('tabpanel', { name: 'Quarter' })).not.toHaveAttribute('tabindex')
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Export quarter' })).toHaveFocus()

    await user.click(screen.getByRole('tab', { name: 'Year' }))
    expect(screen.getByRole('tabpanel', { name: 'Year' })).toHaveAttribute('tabindex', '0')
    await user.tab()
    expect(screen.getByRole('tabpanel', { name: 'Year' })).toHaveFocus()
  })

  it('follows the value prop when controlled', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn<(value: string) => void>()

    function Controlled() {
      const [value, setValue] = useState('year')
      return (
        <Tabs
          label="Period"
          items={items}
          value={value}
          onValueChange={(next) => {
            onValueChange(next)
            setValue(next)
          }}
        />
      )
    }

    render(<Controlled />)
    expect(screen.getByRole('tab', { name: 'Year' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Quarter' }))
    expect(onValueChange).toHaveBeenCalledWith('quarter')
    expect(screen.getByRole('tab', { name: 'Quarter' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps the selection when a controlled parent ignores the change', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Period" items={items} value="month" onValueChange={() => undefined} />)

    await user.click(screen.getByRole('tab', { name: 'Year' }))
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Year' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Quarter' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveFocus()
  })

  it('re-checks the panel tab stop when its content changes on its own', async () => {
    function Expandable() {
      const [expanded, setExpanded] = useState(false)
      useEffect(() => {
        const timer = setTimeout(() => {
          setExpanded(true)
        }, 0)
        return () => {
          clearTimeout(timer)
        }
      }, [])
      return expanded ? <button type="button">Collapse</button> : <p>Collapsed</p>
    }

    render(<Tabs label="Period" items={[{ id: 'month', label: 'This month', content: <Expandable /> }]} />)
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('tabindex', '0')
    await waitFor(() => {
      expect(panel).not.toHaveAttribute('tabindex')
    })
  })
})
