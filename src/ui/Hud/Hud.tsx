import { useEffect, type RefCallback } from 'react'

import { defaultLocale, formatCount } from '../../domain/format'
import { type HudMetrics, observeHud, useHudMetrics } from '../../state/hud'
import { cx } from '../classes'
import styles from './Hud.module.css'

export interface HudPanelProps {
  readonly metrics: HudMetrics
  readonly label?: string | undefined
  readonly placement?: 'fixed' | 'inline' | undefined
  readonly locale?: string | undefined
  readonly ref?: RefCallback<HTMLElement> | undefined
}

function formatMilliseconds(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'millisecond', unitDisplay: 'short', maximumFractionDigits: 0 }).format(value)
}

export function HudPanel({ metrics, label = 'Performance', placement = 'fixed', locale = defaultLocale(), ref }: HudPanelProps) {
  const rows = [
    {
      name: 'Worst interaction',
      value: !metrics.supported.event
        ? 'Not supported'
        : metrics.worstInteraction === null ? 'None yet' : formatMilliseconds(metrics.worstInteraction, locale),
    },
    {
      name: 'Long tasks',
      value: metrics.supported.longtask
        ? `${formatCount(metrics.longTaskCount, locale)} (${formatMilliseconds(metrics.longTaskTotal, locale)})`
        : 'Not supported',
    },
    {
      name: 'DOM nodes',
      value: metrics.domNodes === null ? 'Not sampled' : formatCount(metrics.domNodes, locale),
    },
    {
      name: 'Chart draw rate',
      value: metrics.drawRate === null ? 'Not measured' : `${formatCount(Math.round(metrics.drawRate), locale)} fps`,
    },
  ]

  return (
    <section ref={ref} className={cx(styles.hud, placement === 'fixed' && styles.fixed)} aria-label={label}>
      <dl className={styles.rows}>
        {rows.map(({ name, value }) => (
          <div key={name} className={styles.row}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function publishHeight(panel: HTMLElement | null) {
  if (panel === null) {
    return
  }

  const root = document.documentElement
  const publish = () => {
    root.style.setProperty('--hud-height', `${String(panel.offsetHeight)}px`)
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
  root.dataset.hudOpen = ''
  publish()
  observer?.observe(panel)

  return () => {
    observer?.disconnect()
    delete root.dataset.hudOpen
    root.style.removeProperty('--hud-height')
  }
}

export function Hud() {
  const metrics = useHudMetrics()

  useEffect(() => observeHud(), [])

  return <HudPanel metrics={metrics} ref={publishHeight} />
}
