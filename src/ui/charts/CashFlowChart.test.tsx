import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { canvasCalls, fakeResizeObserver, type RecordedPattern } from '../../../tests/unit/canvas'
import { getHudMetrics, observeHud, resetHudForTest } from '../../state/hud'
import { CashFlowChart } from './CashFlowChart'
import { chartMonths, type MonthTotalsAt } from './months'

const totals: MonthTotalsAt[] = [
  ...Array.from({ length: 12 }, (_, offset): MonthTotalsAt => ({
    start: Date.UTC(2025, 8 + offset, 1),
    income: 500_000,
    expense: 400_000,
    net: offset === 3 ? -50_000 : 100_000,
    kind: 'complete',
  })),
  { start: Date.UTC(2026, 8, 1), income: 200_000, expense: 150_000, net: 50_000, kind: 'current' },
  { start: Date.UTC(2026, 9, 1), income: 500_000, expense: 520_000, net: -20_000, kind: 'forecast' },
  { start: Date.UTC(2026, 10, 1), income: 500_000, expense: 450_000, net: 50_000, kind: 'forecast' },
  { start: Date.UTC(2026, 11, 1), income: 500_000, expense: 400_000, net: 100_000, kind: 'forecast' },
]

const months = chartMonths(totals, 'en-GB')

function renderChart() {
  return render(<CashFlowChart months={months} currency="EUR" locale="en-GB" />)
}

describe('CashFlowChart', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetHudForTest()
  })

  it('is a figure with a caption, a summary, a labelled canvas and a table fallback', () => {
    renderChart()
    const figure = screen.getByRole('figure')
    const summary = 'Net cash flow over the last 12 months: from +€1,000.00 in September 2025 to +€1,000.00 in August 2026; '
      + 'forecast -€200.00 to +€1,000.00 for the next 3 months.'

    expect(figure.querySelector('figcaption')).toHaveTextContent('Net cash flow by month')
    expect(within(figure).getByText(summary).tagName).toBe('P')
    expect(within(figure).getByRole('img', { name: summary }).tagName).toBe('CANVAS')
    expect(within(figure).getByText('Show as table').tagName).toBe('SUMMARY')

    const rows = within(within(figure).getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true })

    expect(rows).toHaveLength(17)
    expect(within(rows[0] ?? figure).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent))
      .toEqual(['Month', 'Income', 'Expense', 'Net', 'Forecast'])
    expect(within(rows[14] ?? figure).getAllByRole('cell', { hidden: true }).map((cell) => cell.textContent))
      .toEqual(['€5,000.00', '€5,200.00', '-€200.00', 'Yes'])
    expect(within(rows[1] ?? figure).getAllByRole('cell', { hidden: true })[2]).toHaveTextContent('+€1,000.00')
    expect(within(rows[13] ?? figure).getAllByRole('cell', { hidden: true }).at(-1)).toHaveTextContent('To date')
  })

  function liveValue(cursor: HTMLElement): HTMLElement {
    const value = document.getElementById(cursor.getAttribute('aria-describedby') ?? '')
    if (value === null) {
      throw new Error('No live value element')
    }
    return value
  }

  function countAnnouncements(value: HTMLElement): () => number {
    let count = 0
    const observer = new MutationObserver((records) => {
      count += records.length
    })
    observer.observe(value, { childList: true, characterData: true, subtree: true })
    return () => count + observer.takeRecords().length
  }

  async function drawn() {
    vi.stubGlobal('ResizeObserver', fakeResizeObserver(640, 256))
    vi.stubGlobal('devicePixelRatio', 2)
    const view = renderChart()
    const canvas = screen.getByRole('img')
    await waitFor(() => {
      expect(canvasCalls(canvas).filter((call) => call.name === 'roundRect')).toHaveLength(16)
    })
    return { ...view, canvas }
  }

  it('moves the keyboard cursor month by month and announces each move once', async () => {
    const user = userEvent.setup()
    renderChart()
    const cursor = screen.getByRole('group', { name: 'Net cash flow by month' })
    const value = liveValue(cursor)

    expect(cursor).toHaveAttribute('tabindex', '0')
    expect(cursor).toHaveAttribute('aria-roledescription', 'chart')
    expect(value).toHaveAttribute('aria-live', 'polite')

    await user.tab()

    expect(cursor).toHaveFocus()
    expect(value).toHaveTextContent('September 2026: net +€500.00, income €2,000.00, expense €1,500.00, to date')

    const announcements = countAnnouncements(value)

    await user.keyboard('{ArrowLeft}')
    expect(value).toHaveTextContent(/^August 2026: net \+€1,000.00/)

    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(value).toHaveTextContent('October 2026: net -€200.00, income €5,000.00, expense €5,200.00, forecast')

    await user.keyboard('{Home}')
    expect(value).toHaveTextContent(/^September 2025:/)

    await user.keyboard('{ArrowLeft}')
    expect(value).toHaveTextContent(/^September 2025:/)

    await user.keyboard('{End}')
    expect(value).toHaveTextContent(/^December 2026:.*forecast$/)
    expect(announcements()).toBe(5)
  })

  it('shows the tooltip for the cursor month, hides it on Escape without moving focus, and on blur', async () => {
    const user = userEvent.setup()
    const { container } = renderChart()
    const tooltip = container.querySelector('[data-chart-tooltip]')
    const cursor = screen.getByRole('group', { name: 'Net cash flow by month' })

    expect(tooltip).not.toBeVisible()

    await user.tab()
    await user.keyboard('{ArrowRight}')

    expect(tooltip).toBeVisible()
    expect(tooltip).toHaveTextContent('October 2026Forecast')
    expect(tooltip).toHaveTextContent('Net-€200.00Income€5,000.00Expense€5,200.00')

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    cursor.dispatchEvent(escape)

    await waitFor(() => {
      expect(tooltip).not.toBeVisible()
    })
    expect(escape.defaultPrevented).toBe(true)
    expect(cursor).toHaveFocus()

    await user.keyboard('{ArrowLeft}')

    expect(tooltip).toHaveTextContent('September 2026To date')

    await user.tab()

    expect(tooltip).not.toBeVisible()
  })

  it('shows the tooltip and crosshair on hover without announcing, and a key clears the hover', async () => {
    const user = userEvent.setup()
    const { container } = await drawn()
    const cursor = screen.getByRole('group', { name: 'Net cash flow by month' })
    const value = liveValue(cursor)
    const crosshair = container.querySelector('[data-chart-crosshair]')
    const tooltip = container.querySelector('[data-chart-tooltip]')
    const plot = crosshair?.parentElement
    const announcements = countAnnouncements(value)

    expect(crosshair).not.toBeVisible()

    fireEvent.pointerMove(cursor, { clientX: 630 })

    expect(crosshair).toBeVisible()
    expect(tooltip).toHaveTextContent(/^December 2026Forecast/)
    expect(plot?.style.getPropertyValue('--cursor-x')).not.toBe('')
    expect(announcements()).toBe(0)

    await user.tab()
    await user.keyboard('{End}')
    await user.keyboard('{End}')

    expect(tooltip).toHaveTextContent(/^December 2026Forecast/)

    fireEvent.pointerMove(cursor, { clientX: 60 })

    expect(tooltip).toHaveTextContent(/^September 2025/)

    await user.keyboard('{ArrowRight}')

    expect(tooltip).toHaveTextContent(/^December 2026Forecast/)

    fireEvent.pointerMove(cursor, { clientX: 630 })
    fireEvent.keyDown(cursor, { key: 'Escape' })

    expect(tooltip).not.toBeVisible()
  })

  it('hides a hover tooltip on Escape pressed anywhere, and keeps it hidden through jitter on the same month', async () => {
    const { container } = await drawn()
    const cursor = screen.getByRole('group', { name: 'Net cash flow by month' })
    const tooltip = container.querySelector('[data-chart-tooltip]')

    expect(cursor).not.toHaveFocus()

    fireEvent.pointerMove(cursor, { clientX: 630 })

    expect(tooltip).toBeVisible()

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(escape)

    await waitFor(() => {
      expect(tooltip).not.toBeVisible()
    })
    expect(escape.defaultPrevented).toBe(true)

    fireEvent.pointerMove(cursor, { clientX: 631 })
    fireEvent.pointerMove(cursor, { clientX: 629 })

    expect(tooltip).not.toBeVisible()

    fireEvent.pointerMove(cursor, { clientX: 60 })

    expect(tooltip).toBeVisible()
    expect(tooltip).toHaveTextContent(/^September 2025/)

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.pointerLeave(cursor)
    fireEvent.pointerMove(cursor, { clientX: 60 })

    expect(tooltip).toBeVisible()
  })

  it('draws at the device pixel ratio with tokens, hatched forecast bars and a draw rate while the HUD is open', async () => {
    const stop = observeHud()
    const { canvas } = await drawn()
    const calls = canvasCalls(canvas)
    const patternFills = calls.filter((call) => call.name === 'set fillStyle' && (call.args[0] as Partial<RecordedPattern> | null)?.kind === 'pattern')

    expect(canvas).toHaveAttribute('width', '1280')
    expect(canvas).toHaveAttribute('height', '512')
    expect(calls.find((call) => call.name === 'setTransform' && call.args[0] === 2)).toBeDefined()
    expect(calls.filter((call) => call.name === 'createPattern')).toHaveLength(2)
    expect(patternFills).toHaveLength(3)
    expect((patternFills[0]?.args[0] as RecordedPattern).transform).toEqual({ a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 })
    expect(calls.filter((call) => call.name === 'fillText').map((call) => call.args[0])).toEqual(
      expect.arrayContaining(['Forecast', 'To date', 'Sept', '2025', 'Jan', '2026']),
    )
    expect(calls.filter((call) => call.name === 'roundRect').map((call) => call.args[4])).toContainEqual([0, 0, 4, 4])

    await waitFor(() => {
      expect(getHudMetrics().drawRate).toBeGreaterThan(0)
    })
    stop()
  })
})
