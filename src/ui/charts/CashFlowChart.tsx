import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { formatMoney, formatSignedMoney } from '../../domain/format'
import type { Currency } from '../../domain/world'
import { anchorName, anchorRef } from '../anchor'
import { ScrollRegion } from '../ScrollRegion/ScrollRegion'
import styles from './CashFlowChart.module.css'
import { type CashFlowGeometry, drawCashFlow } from './drawCashFlow'
import { type CashFlowMonth, cashFlowSummaryParts, monthReadout } from './months'
import { useCanvas } from './useCanvas'

export interface CashFlowChartProps {
  readonly months: readonly CashFlowMonth[]
  readonly currency: Currency
  readonly locale: string
  readonly caption?: string | undefined
}

const KEY_STEPS: Readonly<Record<string, (index: number, last: number) => number>> = {
  ArrowLeft: (index) => Math.max(0, index - 1),
  ArrowRight: (index, last) => Math.min(last, index + 1),
  Home: () => 0,
  End: (_, last) => last,
}

const KIND_LABELS = { complete: 'No', current: 'To date', forecast: 'Yes' } as const

export function CashFlowChart({ months, currency, locale, caption = 'Net cash flow by month' }: CashFlowChartProps) {
  const id = useId()
  const valueId = `${id}-value`
  const anchor = anchorName('chart-cursor', id)
  const summaryParts = cashFlowSummaryParts(months, currency, locale)
  const summary = summaryParts.map((part) => part.text).join('')
  const [cursor, setCursor] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('Use the arrow keys to move between months.')
  const geometryRef = useRef<CashFlowGeometry | null>(null)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const shownRef = useRef<number | null>(null)
  const active = hover ?? cursor
  const shown = active !== null && active === dismissedAt ? null : active
  const month = shown === null ? undefined : months[shown]
  const last = months.length - 1
  const money = (value: number): string => formatMoney(value, currency, locale)
  const signed = (value: number): string => formatSignedMoney(value, currency, locale)

  function positionAt(index: number | null): void {
    const geometry = geometryRef.current
    const plot = plotRef.current
    const target = index === null ? undefined : months[index]
    if (geometry === null || plot === null || index === null || target === undefined) {
      return
    }
    const end = geometry.y(target.net)
    const zero = geometry.y(0)
    const properties = {
      '--cursor-x': geometry.band.center(index),
      '--bar-x': geometry.band.start(index),
      '--bar-y': Math.min(end, zero),
      '--bar-width': geometry.band.bandwidth,
      '--bar-height': Math.abs(end - zero),
      '--plot-top': geometry.top,
      '--plot-bottom': geometry.bottom,
    }
    for (const [name, value] of Object.entries(properties)) {
      plot.style.setProperty(name, `${String(value)}px`)
    }
  }

  const canvasRef = useCanvas((frame) => {
    geometryRef.current = drawCashFlow(frame, months, currency, locale)
    positionAt(shownRef.current)
    return false
  }, { measureDrawRate: true })

  useLayoutEffect(() => {
    shownRef.current = shown
    positionAt(shown)
  })

  useEffect(() => {
    if (shown === null) {
      return
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissedAt(shown)
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, true)
    }
  }, [shown])

  function moveTo(index: number): void {
    const target = months[index]
    setCursor(index)
    setDismissedAt(null)
    if (target !== undefined) {
      setAnnouncement(monthReadout(target, currency, locale))
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = KEY_STEPS[event.key]
    if (step === undefined || last < 0) {
      return
    }
    event.preventDefault()
    setHover(null)
    const next = step(cursor ?? last, last)
    if (next !== cursor) {
      moveTo(next)
    } else {
      setDismissedAt(null)
    }
  }

  function handleFocus(): void {
    if (cursor === null && last >= 0) {
      const current = months.findIndex((entry) => entry.kind === 'current')
      moveTo(current >= 0 ? current : last)
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const geometry = geometryRef.current
    if (geometry === null) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const index = geometry.band.index(event.clientX - rect.left)
    if (index !== hover) {
      positionAt(index)
      setHover(index)
    }
    if (index !== dismissedAt) {
      setDismissedAt(null)
    }
  }

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>{caption}</figcaption>
      <div className={styles.lead}>
        <p className={styles.summary}>
          {summaryParts.map((part, index) => (part.money ? <span key={index} className="money">{part.text}</span> : part.text))}
        </p>
        <div ref={plotRef} className={styles.plot}>
          <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={summary} />
          <div className={styles.crosshair} hidden={month === undefined} data-chart-crosshair="" />
          <div ref={anchorRef<HTMLDivElement>('anchor-name', anchor)} className={styles.anchor} data-chart-anchor="" />
          <div
            className={styles.cursor}
            tabIndex={0}
            role="group"
            aria-roledescription="chart"
            aria-label={caption}
            aria-describedby={valueId}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={() => {
              setCursor(null)
              setDismissedAt(null)
            }}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => {
              setHover(null)
              setDismissedAt(null)
            }}
          />
          <div
            ref={anchorRef<HTMLDivElement>('position-anchor', anchor)}
            className={styles.tooltip}
            hidden={month === undefined}
            aria-hidden="true"
            data-chart-tooltip=""
          >
            {month === undefined ? null : (
              <>
                <p className={styles.tooltipMonth}>
                  {month.label}
                  {month.kind === 'forecast' && <span className={styles.flag}>Forecast</span>}
                  {month.kind === 'current' && <span className={styles.flag}>To date</span>}
                </p>
                <dl className={styles.values}>
                  <dt>Net</dt>
                  <dd className={styles.net}>{signed(month.net)}</dd>
                  <dt>Income</dt>
                  <dd>{money(month.income)}</dd>
                  <dt>Expense</dt>
                  <dd>{money(month.expense)}</dd>
                </dl>
              </>
            )}
          </div>
        </div>
      </div>
      <p id={valueId} className="visually-hidden" aria-live="polite">{announcement}</p>
      <details className={styles.details}>
        <summary>Show as table</summary>
        <ScrollRegion label={`${caption}, table, scrolls sideways`} className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className={styles.number}>Income</th>
                <th scope="col" className={styles.number}>Expense</th>
                <th scope="col" className={styles.number}>Net</th>
                <th scope="col">Forecast</th>
              </tr>
            </thead>
            <tbody>
              {months.map((entry) => (
                <tr key={entry.start}>
                  <th scope="row">{entry.label}</th>
                  <td className={styles.number}>{money(entry.income)}</td>
                  <td className={styles.number}>{money(entry.expense)}</td>
                  <td className={styles.number}>{signed(entry.net)}</td>
                  <td>{KIND_LABELS[entry.kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </details>
    </figure>
  )
}
