import { useEffect, useId, useState, type PointerEvent, type ReactNode, type RefCallback, type ToggleEvent } from 'react'

import { anchorName, anchorRef } from '../anchor'
import { cx } from '../classes'
import styles from './Tooltip.module.css'

const HIDE_GRACE_MS = 150

const hideTimers = new Map<string, ReturnType<typeof setTimeout>>()

export interface TooltipTriggerProps {
  readonly ref: RefCallback<HTMLElement>
  readonly 'aria-describedby': string
  readonly onPointerEnter: () => void
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void
  readonly onFocus: () => void
  readonly onBlur: () => void
}

export interface TooltipProps {
  readonly content: string
  readonly describedBy?: string | undefined
  readonly children: (trigger: TooltipTriggerProps) => ReactNode
  readonly className?: string | undefined
}

function cancelHide(id: string): void {
  const timer = hideTimers.get(id)

  if (timer !== undefined) {
    clearTimeout(timer)
    hideTimers.delete(id)
  }
}

function setTooltipOpen(id: string, open: boolean): void {
  cancelHide(id)
  const panel = document.getElementById(id)

  if (panel === null || panel.matches(':popover-open') === open) {
    return
  }

  if (open) {
    panel.showPopover()
  } else {
    panel.hidePopover()
  }
}

function scheduleHide(id: string): void {
  cancelHide(id)
  hideTimers.set(id, setTimeout(() => {
    hideTimers.delete(id)
    setTooltipOpen(id, false)
  }, HIDE_GRACE_MS))
}

function tokens(value: string | null): string[] {
  return (value ?? '').split(/\s+/).filter((token) => token !== '')
}

function isTriggerOf(target: EventTarget | null, id: string): boolean {
  return target instanceof Element && tokens(target.closest('[aria-describedby]')?.getAttribute('aria-describedby') ?? null).includes(id)
}

export function Tooltip({ content, describedBy, children, className }: TooltipProps) {
  const id = useId()
  const anchor = anchorName('tooltip', id)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setTooltipOpen(id, false)
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, true)
    }
  }, [open, id])

  const trigger: TooltipTriggerProps = {
    ref: (node) => {
      if (node === null) {
        return
      }

      const cleanupAnchor = anchorRef<HTMLElement>('anchor-name', anchor)(node)

      return () => {
        queueMicrotask(() => {
          if (!node.isConnected) {
            setTooltipOpen(id, false)
          }
        })
        if (typeof cleanupAnchor === 'function') {
          cleanupAnchor()
        }
      }
    },
    'aria-describedby': [...tokens(describedBy ?? null).filter((token) => token !== id), id].join(' '),
    onPointerEnter: () => {
      setTooltipOpen(id, true)
    },
    onPointerLeave: (event) => {
      if (event.currentTarget !== document.activeElement) {
        scheduleHide(id)
      }
    },
    onFocus: () => {
      setTooltipOpen(id, true)
    },
    onBlur: () => {
      setTooltipOpen(id, false)
    },
  }

  return (
    <>
      {children(trigger)}
      <div
        ref={anchorRef<HTMLDivElement>('position-anchor', anchor)}
        id={id}
        className={cx(styles.tooltip, className)}
        role="tooltip"
        popover="manual"
        onToggle={(event: ToggleEvent<HTMLDivElement>) => {
          setOpen(event.newState === 'open')
        }}
        onPointerEnter={() => {
          cancelHide(id)
        }}
        onPointerLeave={(event: PointerEvent<HTMLDivElement>) => {
          if (!isTriggerOf(event.relatedTarget, id)) {
            setTooltipOpen(id, false)
          }
        }}
      >
        {content}
      </div>
    </>
  )
}
