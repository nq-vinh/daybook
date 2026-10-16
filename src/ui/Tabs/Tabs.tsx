import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'

import { cx } from '../classes'
import { rovingIndex, useElementMap, type RovingMove } from '../roving'
import styles from './Tabs.module.css'

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'summary',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const moves: Partial<Record<string, RovingMove>> = {
  ArrowRight: 'next',
  ArrowLeft: 'previous',
  Home: 'first',
  End: 'last',
}

function syncPanelTabStop(panel: HTMLElement): void {
  const focusable = panel.querySelector(FOCUSABLE) !== null

  if (focusable && panel.hasAttribute('tabindex')) {
    panel.removeAttribute('tabindex')
  } else if (!focusable && panel.getAttribute('tabindex') !== '0') {
    panel.tabIndex = 0
  }
}

export interface TabItem {
  readonly id: string
  readonly label: string
  readonly content: ReactNode
}

export interface TabsProps {
  readonly label: string
  readonly items: readonly TabItem[]
  readonly value?: string | undefined
  readonly defaultValue?: string | undefined
  readonly onValueChange?: ((value: string) => void) | undefined
  readonly className?: string | undefined
}

export function Tabs({ label, items, value, defaultValue, onValueChange, className }: TabsProps) {
  const baseId = useId()
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const tabElements = useElementMap<HTMLButtonElement>()
  const panelElements = useElementMap<HTMLDivElement>()

  const requested = value ?? uncontrolled
  const selected = items.some((item) => item.id === requested) ? requested : items[0]?.id

  useEffect(() => {
    const panel = selected === undefined ? undefined : panelElements.get(selected)

    if (panel === undefined) {
      return
    }

    const sync = () => {
      syncPanelTabStop(panel)
    }
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'href', 'tabindex', 'contenteditable', 'controls'] })
    return () => {
      observer.disconnect()
    }
  }, [selected, panelElements])

  function select(item: TabItem | undefined) {
    if (item === undefined) {
      return
    }

    tabElements.get(item.id)?.focus()
    if (item.id !== selected) {
      setUncontrolled(item.id)
      onValueChange?.(item.id)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const move = moves[event.key]

    if (move !== undefined) {
      event.preventDefault()
      select(items[rovingIndex(items, index, move, { wrap: true })])
    }
  }

  return (
    <div className={cx(styles.tabs, className)}>
      <div className={styles.list} role="tablist" aria-label={label}>
        {items.map((item, index) => {
          const isSelected = item.id === selected

          return (
            <button
              key={item.id}
              ref={tabElements.register(item.id)}
              id={`${baseId}-tab-${item.id}`}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => {
                select(item)
              }}
              onKeyDown={(event) => {
                handleKeyDown(event, index)
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          ref={panelElements.register(item.id)}
          id={`${baseId}-panel-${item.id}`}
          className={styles.panel}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== selected}
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}
