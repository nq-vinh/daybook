import { useEffect, useId, useRef, type MouseEvent } from 'react'

import { dismiss, getToasts, MAX_VISIBLE_TOASTS, setToastTimersPaused, useToasts, type Toast } from '../../state/toast'
import { Button } from '../Button/Button'
import { cx } from '../classes'
import { Icon } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'
import styles from './Toast.module.css'

interface ToastCardProps {
  readonly toast: Toast
  readonly onDismiss: (hadFocus: boolean) => void
}

function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const titleId = useId()

  function hadFocus(event: MouseEvent<HTMLButtonElement>): boolean {
    return event.currentTarget === document.activeElement
  }

  return (
    <article className={styles.toast} aria-labelledby={titleId}>
      <div className={styles.text}>
        <p id={titleId} className={styles.title}>{toast.title}</p>
        {toast.description !== undefined && <p className={styles.description}>{toast.description}</p>}
      </div>
      {toast.action !== undefined && (
        <Button
          variant="quiet"
          size="sm"
          onClick={(event) => {
            toast.action?.onAction()
            onDismiss(hadFocus(event))
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <IconButton
        label="Dismiss notification"
        size="sm"
        aria-describedby={titleId}
        data-toast-dismiss=""
        onClick={(event) => {
          onDismiss(hadFocus(event))
        }}
      >
        <Icon name="close" />
      </IconButton>
    </article>
  )
}

export interface ToastRegionProps {
  readonly className?: string | undefined
}

export function ToastRegion({ className }: ToastRegionProps) {
  const toasts = useToasts()
  const regionRef = useRef<HTMLElement | null>(null)
  const hoveredRef = useRef(false)
  const focusedRef = useRef(false)
  const pendingFocusRef = useRef<number | null>(null)

  useEffect(() => {
    const pending = pendingFocusRef.current
    pendingFocusRef.current = null
    if (pending !== null) {
      const articles = regionRef.current?.querySelectorAll('article') ?? []
      articles[Math.min(pending, articles.length - 1)]?.querySelector<HTMLElement>('[data-toast-dismiss]')?.focus()
    }

    focusedRef.current = regionRef.current?.contains(document.activeElement) ?? false
    setToastTimersPaused(hoveredRef.current || focusedRef.current)
  }, [toasts])

  useEffect(() => {
    const region = regionRef.current

    if (region === null) {
      return
    }

    function sync() {
      setToastTimersPaused(hoveredRef.current || focusedRef.current)
    }

    function handlePointerEnter() {
      hoveredRef.current = true
      sync()
    }

    function handlePointerLeave() {
      hoveredRef.current = false
      sync()
    }

    function handleFocusIn() {
      focusedRef.current = true
      sync()
    }

    function handleFocusOut(event: FocusEvent) {
      if (!(event.relatedTarget instanceof Node && region?.contains(event.relatedTarget) === true)) {
        focusedRef.current = false
        sync()
      }
    }

    region.addEventListener('pointerenter', handlePointerEnter)
    region.addEventListener('pointerleave', handlePointerLeave)
    region.addEventListener('focusin', handleFocusIn)
    region.addEventListener('focusout', handleFocusOut)

    return () => {
      region.removeEventListener('pointerenter', handlePointerEnter)
      region.removeEventListener('pointerleave', handlePointerLeave)
      region.removeEventListener('focusin', handleFocusIn)
      region.removeEventListener('focusout', handleFocusOut)
      hoveredRef.current = false
      focusedRef.current = false
      setToastTimersPaused(false)
    }
  }, [])

  return (
    <section
      ref={regionRef}
      className={cx(styles.region, className)}
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Notifications"
    >
      {toasts.slice(0, MAX_VISIBLE_TOASTS).map((item, index) => (
        <ToastCard
          key={item.id}
          toast={item}
          onDismiss={(hadFocus) => {
            const present = getToasts().some((candidate) => candidate.id === item.id)
            pendingFocusRef.current = hadFocus && present ? index : null
            if (!dismiss(item.id)) {
              pendingFocusRef.current = null
            }
          }}
        />
      ))}
    </section>
  )
}
