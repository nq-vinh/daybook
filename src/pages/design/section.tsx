import { useId, useState, type ReactNode } from 'react'

import { cx } from '../../ui/classes'
import styles from './design.module.css'

export function cssProperties(properties: Readonly<Record<string, string>>) {
  return (element: HTMLElement | null) => {
    if (element === null) {
      return
    }

    for (const [name, value] of Object.entries(properties)) {
      element.style.setProperty(name, value)
    }
  }
}

export function forceFocusOn(selector: string) {
  return (container: HTMLElement | null) => {
    const target = container?.querySelector(selector)
    target?.setAttribute('data-force-focus', '')

    return () => {
      target?.removeAttribute('data-force-focus')
    }
  }
}

type ScrollRegionProps = { readonly children: ReactNode } & (
  | { readonly label: string; readonly labelledBy?: undefined }
  | { readonly labelledBy: string; readonly label?: undefined }
)

export function ScrollRegion({ label, labelledBy, children }: ScrollRegionProps) {
  const [overflowing, setOverflowing] = useState(false)

  function wrapperRef(wrapper: HTMLDivElement | null) {
    if (wrapper === null || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      setOverflowing(wrapper.scrollWidth > wrapper.clientWidth)
    })
    observer.observe(wrapper)
    if (wrapper.firstElementChild !== null) {
      observer.observe(wrapper.firstElementChild)
    }

    return () => {
      observer.disconnect()
    }
  }

  if (!overflowing) {
    return <div ref={wrapperRef} className={styles.scroll}>{children}</div>
  }

  return (
    <div ref={wrapperRef} className={styles.scroll} role="region" aria-label={label} aria-labelledby={labelledBy} tabIndex={0}>
      {children}
    </div>
  )
}

interface DataTableProps {
  readonly caption: string
  readonly hideCaption?: boolean | undefined
  readonly className: string | undefined
  readonly children: ReactNode
}

export function DataTable({ caption, hideCaption = false, className, children }: DataTableProps) {
  const captionId = useId()

  return (
    <ScrollRegion labelledBy={captionId}>
      <table className={className}>
        <caption id={captionId} className={hideCaption ? 'visually-hidden' : styles.caption}>{caption}</caption>
        {children}
      </table>
    </ScrollRegion>
  )
}

interface SectionProps {
  readonly id: string
  readonly title: string
  readonly children: ReactNode
}

export function Section({ id, title, children }: SectionProps) {
  return (
    <section className={styles.section}>
      <h2 id={id} className={styles.heading}>{title}</h2>
      {children}
    </section>
  )
}

interface SwatchProps {
  readonly properties: Readonly<Record<string, string>>
  readonly className?: string | undefined
}

export function Swatch({ properties, className }: SwatchProps) {
  return <span className={cx(styles.swatch, className)} ref={cssProperties(properties)} aria-hidden="true" />
}

export interface StateExample {
  readonly label: string
  readonly content: ReactNode
}

interface StatesProps {
  readonly items: readonly StateExample[]
  readonly stacked?: boolean | undefined
}

export function States({ items, stacked = false }: StatesProps) {
  return (
    <ul className={cx(styles.states, stacked && styles.stacked)}>
      {items.map(({ label, content }) => (
        <li key={label} className={styles.state}>
          <span className={styles.stateLabel}>{label}</span>
          {content}
        </li>
      ))}
    </ul>
  )
}

interface ComponentSectionProps {
  readonly name: string
  readonly description: string
  readonly keyboard: readonly string[]
  readonly hover?: string | undefined
  readonly children: ReactNode
}

export function componentId(name: string): string {
  return `component-${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`
}

export function ComponentSection({ name, description, keyboard, hover, children }: ComponentSectionProps) {
  return (
    <section className={styles.component}>
      <h3 id={componentId(name)} className={styles.heading}>{name}</h3>
      <p>{description}</p>
      {children}
      <dl className={styles.contract}>
        <dt>Keyboard</dt>
        {keyboard.map((sentence) => <dd key={sentence}>{sentence}</dd>)}
        {hover === undefined ? null : (
          <>
            <dt>Hover</dt>
            <dd>{hover}</dd>
          </>
        )}
      </dl>
    </section>
  )
}
