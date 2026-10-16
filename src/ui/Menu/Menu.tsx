import { useId, useRef, useState, type KeyboardEvent, type ToggleEvent } from 'react'

import { anchorName, anchorRef } from '../anchor'
import { Button, type ButtonSize, type ButtonVariant } from '../Button/Button'
import { Icon, type IconName } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'
import { mergeRefs } from '../refs'
import { rovingIndex, useElementMap, type RovingMove } from '../roving'
import styles from './Menu.module.css'

export interface MenuItem {
  readonly kind?: 'item' | undefined
  readonly id: string
  readonly label: string
  readonly onSelect: () => void
  readonly icon?: IconName | undefined
  readonly disabled?: boolean | undefined
}

export interface MenuSeparator {
  readonly kind: 'separator'
  readonly id: string
}

export type MenuEntry = MenuItem | MenuSeparator

export interface MenuProps {
  readonly label: string
  readonly items: readonly MenuEntry[]
  readonly icon?: IconName | undefined
  readonly iconOnly?: boolean | undefined
  readonly variant?: ButtonVariant | undefined
  readonly size?: ButtonSize | undefined
  readonly className?: string | undefined
}

function isEnabledItem(entry: MenuEntry): entry is MenuItem {
  return entry.kind !== 'separator' && entry.disabled !== true
}

export function Menu({ label, items, icon, iconOnly = false, variant = 'secondary', size = 'md', className }: MenuProps) {
  const baseId = useId()
  const triggerId = `${baseId}-trigger`
  const panelId = `${baseId}-menu`
  const anchor = anchorName('menu', baseId)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const itemElements = useElementMap<HTMLButtonElement>()
  const openFocusRef = useRef<'first' | 'last'>('first')
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const isDisabled = (entry: MenuEntry) => !isEnabledItem(entry)
  const firstIndex = rovingIndex(items, -1, 'first', { wrap: true, isDisabled })
  const activeIndex = items.findIndex((entry) => entry.id === activeId && isEnabledItem(entry))
  const currentIndex = activeIndex === -1 ? firstIndex : activeIndex
  const currentId = items[currentIndex]?.id ?? null

  function focusIndex(index: number) {
    const entry = items[index]

    if (entry === undefined || !isEnabledItem(entry)) {
      return
    }

    setActiveId(entry.id)
    itemElements.get(entry.id)?.focus()
  }

  function handleToggle(event: ToggleEvent<HTMLDivElement>) {
    const isOpen = event.newState === 'open'
    setOpen(isOpen)

    if (isOpen) {
      focusIndex(rovingIndex(items, -1, openFocusRef.current, { wrap: true, isDisabled }))
      openFocusRef.current = 'first'
      return
    }

    const active = document.activeElement
    if (active === null || active === document.body || panelRef.current?.contains(active) === true) {
      triggerRef.current?.focus()
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }

    event.preventDefault()
    openFocusRef.current = event.key === 'ArrowDown' ? 'first' : 'last'
    const panel = panelRef.current

    if (panel === null) {
      return
    }

    if (panel.matches(':popover-open')) {
      focusIndex(rovingIndex(items, -1, openFocusRef.current, { wrap: true, isDisabled }))
      openFocusRef.current = 'first'
    } else {
      panel.showPopover()
    }
  }

  const moves: Partial<Record<string, RovingMove>> = {
    ArrowDown: 'next',
    ArrowUp: 'previous',
    Home: 'first',
    End: 'last',
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const move = moves[event.key]

    if (move !== undefined) {
      event.preventDefault()
      focusIndex(rovingIndex(items, currentIndex, move, { wrap: true, isDisabled }))
      return
    }

    if (event.key === 'Tab') {
      panelRef.current?.hidePopover()
      return
    }

    if (event.key.length !== 1 || event.key.trim() === '' || event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    const character = event.key.toLocaleLowerCase('en')
    const ordered = [...items.slice(currentIndex + 1), ...items.slice(0, currentIndex + 1)]
    const match = ordered.find(
      (entry) => isEnabledItem(entry) && entry.label.toLocaleLowerCase('en').startsWith(character),
    )

    if (match !== undefined) {
      event.preventDefault()
      focusIndex(items.indexOf(match))
    }
  }

  function select(item: MenuItem) {
    const panel = panelRef.current

    if (item.disabled === true || panel === null || !panel.matches(':popover-open')) {
      return
    }

    panel.hidePopover()
    item.onSelect()
  }

  const triggerProps = {
    id: triggerId,
    variant,
    size,
    className,
    popoverTarget: panelId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onKeyDown: handleTriggerKeyDown,
  } as const

  return (
    <>
      {iconOnly && icon !== undefined ? (
        <IconButton
          {...triggerProps}
          ref={mergeRefs(triggerRef, anchorRef<HTMLButtonElement>('anchor-name', anchor))}
          label={label}
        >
          <Icon name={icon} />
        </IconButton>
      ) : (
        <Button {...triggerProps} ref={mergeRefs(triggerRef, anchorRef<HTMLButtonElement>('anchor-name', anchor))}>
          {icon !== undefined && <Icon name={icon} />}
          {label}
        </Button>
      )}
      <div
        ref={mergeRefs(panelRef, anchorRef<HTMLDivElement>('position-anchor', anchor))}
        id={panelId}
        className={styles.panel}
        popover="auto"
        role="menu"
        aria-labelledby={triggerId}
        onToggle={handleToggle}
      >
        {items.map((entry) => {
          if (entry.kind === 'separator') {
            return <div key={entry.id} className={styles.separator} role="separator" />
          }

          return (
            <button
              key={entry.id}
              ref={itemElements.register(entry.id)}
              type="button"
              role="menuitem"
              className={styles.item}
              tabIndex={entry.id === currentId ? 0 : -1}
              aria-disabled={entry.disabled === true ? true : undefined}
              onClick={() => {
                select(entry)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (entry.disabled !== true) {
                  setActiveId(entry.id)
                }
              }}
            >
              {entry.icon !== undefined && <Icon name={entry.icon} />}
              {entry.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
