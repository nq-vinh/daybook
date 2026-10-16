import { useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'

import { cx } from '../classes'
import styles from './Dialog.module.css'

export interface DialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly description?: string | undefined
  readonly children?: ReactNode
  readonly actions?: ReactNode
  readonly className?: string | undefined
}

export function Dialog({ open, onClose, title, description, children, actions, className }: DialogProps) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = description === undefined ? undefined : `${id}-description`
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [reopenCount, setReopenCount] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current

    if (!open || dialog === null) {
      return
    }

    const opener = document.activeElement
    if (!dialog.open) {
      dialog.showModal()
    }

    return () => {
      if (dialog.open) {
        dialog.close()
      }
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus()
      }
    }
  }, [open, reopenCount])

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (!event.cancelable) {
      return
    }

    event.preventDefault()
    onClose()
  }

  function handleClose(event: SyntheticEvent<HTMLDialogElement>) {
    if (open && !event.currentTarget.open) {
      onClose()
      setReopenCount((count) => count + 1)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={cx(styles.dialog, className)}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={handleCancel}
      onClose={handleClose}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>{title}</h2>
        {description !== undefined && <p id={descriptionId} className={styles.description}>{description}</p>}
      </div>
      {children !== undefined && <div className={styles.body}>{children}</div>}
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </dialog>
  )
}
