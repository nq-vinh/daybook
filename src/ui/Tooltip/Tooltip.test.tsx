import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Tooltip } from './Tooltip'

function setup(describedBy?: string) {
  render(
    <>
      <p id="hint">Opens a new tab</p>
      <Tooltip content="Copies the IBAN" describedBy={describedBy}>
        {(trigger) => <button type="button" {...trigger}>Copy</button>}
      </Tooltip>
    </>,
  )
  const button = screen.getByRole('button', { name: 'Copy' })
  const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')
  return { user: userEvent.setup(), button, tooltip }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Tooltip', () => {
  it('describes its trigger with a manual popover tooltip', () => {
    const { button, tooltip } = setup()

    expect(tooltip).toHaveAttribute('popover', 'manual')
    expect(button).toHaveAttribute('aria-describedby', tooltip?.id)
    expect(button).toHaveAccessibleDescription('Copies the IBAN')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('merges extra descriptions passed through describedBy', () => {
    const { button, tooltip } = setup('hint')

    expect(button.getAttribute('aria-describedby')).toBe(`hint ${tooltip?.id ?? ''}`)
    expect(button).toHaveAccessibleDescription('Opens a new tab Copies the IBAN')
  })

  it('shows on focus and hides on blur', async () => {
    const { user, button } = setup()

    await user.tab()
    expect(button).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Copies the IBAN')
    await user.tab()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows on hover and hides shortly after leave', async () => {
    const { user, button } = setup()

    await user.hover(button)
    expect(screen.getByRole('tooltip')).toBeVisible()
    await user.unhover(button)
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })

  it('stays open when the pointer leaves a focused trigger', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { button } = setup()

    act(() => {
      button.focus()
    })
    fireEvent.pointerEnter(button)
    fireEvent.pointerLeave(button)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('tooltip')).toBeVisible()
  })

  it('waits 150 ms after leaving the trigger and stays while the pointer is on the tooltip', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { button, tooltip } = setup()

    fireEvent.pointerEnter(button)
    fireEvent.pointerLeave(button)
    act(() => {
      vi.advanceTimersByTime(149)
    })
    expect(screen.getByRole('tooltip')).toBeVisible()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerEnter(button)
    fireEvent.pointerLeave(button, { relatedTarget: tooltip })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.pointerLeave(tooltip ?? document.body, { relatedTarget: document.body })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerEnter(button)
    fireEvent.pointerLeave(button)
    fireEvent.pointerEnter(button)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('tooltip')).toBeVisible()
  })

  it('hides on Escape while focused or hovered and claims the key', async () => {
    const { user, button } = setup()

    await user.tab()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).toHaveFocus()

    await user.tab()
    await user.hover(button)
    expect(screen.getByRole('tooltip')).toBeVisible()
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hides when the trigger unmounts while the tooltip is open', async () => {
    function Harness() {
      const [shown, setShown] = useState(true)
      return (
        <>
          <button type="button" onClick={() => { setShown(false) }}>Hide trigger</button>
          <Tooltip content="Copies the IBAN">
            {(trigger) => shown && <button type="button" {...trigger}>Copy</button>}
          </Tooltip>
        </>
      )
    }

    render(<Harness />)
    act(() => {
      screen.getByRole('button', { name: 'Copy' }).focus()
    })
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Hide trigger' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
