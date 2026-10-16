import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { closeWithoutCancelableCancel } from '../../../tests/unit/dialog'
import { Button } from '../Button/Button'
import { Dialog } from './Dialog'
import styles from './Dialog.module.css'

function Harness({ onClose }: { readonly onClose: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => { setOpen(true) }}>Delete budget</Button>
      <Dialog
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="Delete the travel budget?"
        description="Spending stays in the ledger."
        actions={<Button onClick={() => { setOpen(false) }}>Cancel</Button>}
      >
        <p>This cannot be undone.</p>
      </Dialog>
    </>
  )
}

function setup() {
  const onClose = vi.fn<() => void>()
  render(<Harness onClose={onClose} />)
  return { onClose, user: userEvent.setup(), opener: screen.getByRole('button', { name: 'Delete budget' }) }
}

describe('Dialog', () => {
  it('stays closed until opened', () => {
    setup()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens modally, labelled by its title and described by its description, and locks scroll', async () => {
    const { user, opener } = setup()

    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Delete the travel budget?' })
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAccessibleDescription('Spending stays in the ledger.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(document.documentElement).toHaveClass(styles.scrollLock ?? 'missing')
  })

  it('reports Escape through onClose and returns focus to the opener', async () => {
    const { user, opener, onClose } = setup()

    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.documentElement).not.toHaveClass(styles.scrollLock ?? 'missing')
  })

  it('closes from the open prop without calling onClose and returns focus', async () => {
    const { user, opener, onClose } = setup()

    await user.click(opener)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(opener).toHaveFocus()
  })

  it('stays open after Escape when the parent ignores onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn<() => void>()
    render(<Dialog open onClose={onClose} title="Confirm transfer" />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Confirm transfer' })).toHaveAttribute('open')
    expect(document.documentElement).toHaveClass(styles.scrollLock ?? 'missing')
  })

  it('reopens after a native close that skipped cancel while the parent keeps it open', () => {
    const onClose = vi.fn<() => void>()
    render(<Dialog open onClose={onClose} title="Confirm transfer" />)
    const dialog = screen.getByRole('dialog', { name: 'Confirm transfer' })

    act(() => {
      if (dialog instanceof HTMLDialogElement) {
        dialog.close()
      }
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog).toHaveAttribute('open')
    expect(document.documentElement).toHaveClass(styles.scrollLock ?? 'missing')
  })

  it('calls onClose exactly once for an Escape whose cancel is not cancelable', () => {
    const onClose = vi.fn<() => void>()
    render(<Dialog open onClose={onClose} title="Confirm transfer" />)
    const dialog = screen.getByRole('dialog', { name: 'Confirm transfer' })

    act(() => {
      if (dialog instanceof HTMLDialogElement) {
        closeWithoutCancelableCancel(dialog)
      }
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog).toHaveAttribute('open')
    expect(document.documentElement).toHaveClass(styles.scrollLock ?? 'missing')
  })

  it('closes and unlocks scroll when unmounted while open', async () => {
    const onClose = vi.fn<() => void>()
    const user = userEvent.setup()
    const { unmount } = render(<Harness onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Delete budget' }))
    unmount()
    expect(document.documentElement).not.toHaveClass(styles.scrollLock ?? 'missing')
    expect(onClose).not.toHaveBeenCalled()
  })
})
