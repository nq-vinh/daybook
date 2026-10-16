import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACTION_DURATION_MS, DEFAULT_DURATION_MS, dismiss, dismissAllToasts, getToasts, toast } from '../../state/toast'
import { ToastRegion } from './Toast'

function show(title: string, extra: Partial<Parameters<typeof toast>[0]> = {}): string {
  let id = ''
  act(() => {
    id = toast({ title, ...extra })
  })
  return id
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  act(() => {
    dismissAllToasts()
  })
  vi.useRealTimers()
})

function setup() {
  render(<ToastRegion />)
  return userEvent.setup()
}

describe('toast store', () => {
  it('returns ids and publishes a frozen snapshot', () => {
    const id = show('Saved budget')

    expect(getToasts().map((item) => item.id)).toEqual([id])
    expect(Object.isFrozen(getToasts())).toBe(true)
    expect(Object.isFrozen(getToasts()[0])).toBe(true)
    act(() => {
      dismiss(id)
    })
    expect(getToasts()).toEqual([])
  })

  it('calls onDismiss once when a toast leaves by time, by the user or by clearing', () => {
    const byTime = vi.fn()
    const byUser = vi.fn()
    const byClear = vi.fn()
    toast({ title: 'Categorised as Travel', duration: 100, onDismiss: byTime })
    const id = toast({ title: 'Categorised as Meals', onDismiss: byUser })
    toast({ title: 'Categorised as Rent', onDismiss: byClear })

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(byTime).toHaveBeenCalledTimes(1)
    act(() => {
      dismiss(id)
      dismiss(id)
    })
    expect(byUser).toHaveBeenCalledTimes(1)
    expect(byClear).not.toHaveBeenCalled()
    act(() => {
      dismissAllToasts()
    })
    expect(byClear).toHaveBeenCalledTimes(1)
    expect(byTime).toHaveBeenCalledTimes(1)
  })
})

describe('ToastRegion', () => {
  it('is a polite status region named Notifications with each toast an article', () => {
    setup()
    show('Categorised 3 transactions', { description: 'Software' })

    const region = screen.getByRole('status', { name: 'Notifications' })
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveAttribute('aria-atomic', 'false')
    expect(screen.getByRole('article', { name: 'Categorised 3 transactions' })).toHaveTextContent('Software')
  })

  it('dismisses after the duration', () => {
    setup()
    show('Saved budget')

    advance(5900)
    expect(screen.getByRole('article')).toBeInTheDocument()
    advance(100)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('pauses while hovered and resumes with the remaining time', async () => {
    const user = setup()
    show('Saved budget')

    advance(2000)
    await user.hover(screen.getByRole('status'))
    advance(10000)
    expect(screen.getByRole('article')).toBeInTheDocument()
    await user.unhover(screen.getByRole('status'))
    advance(3900)
    expect(screen.getByRole('article')).toBeInTheDocument()
    advance(100)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('pauses while focus is inside and resumes when it leaves', async () => {
    const user = setup()
    show('Categorised 3 transactions', { action: { label: 'Undo', onAction: () => undefined } })

    await user.tab()
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()
    advance(10000)
    expect(screen.getByRole('article')).toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toHaveFocus()
    advance(10000)
    expect(screen.getByRole('article')).toBeInTheDocument()
    await user.tab()
    advance(ACTION_DURATION_MS)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('keeps a toast with an action for 10 s so its button can be reached by keyboard, and a plain one for 6 s', () => {
    setup()
    show('Saved the Travel budget as €2,000.00', { action: { label: 'Undo', onAction: () => undefined } })
    show('Restored the Travel budget')

    advance(DEFAULT_DURATION_MS)
    expect(screen.getAllByRole('article').map((article) => article.textContent)).toEqual([expect.stringContaining('Saved the Travel budget')])
    advance(ACTION_DURATION_MS - DEFAULT_DURATION_MS - 100)
    expect(screen.getAllByRole('article')).toHaveLength(1)
    advance(100)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('describes each dismiss button with its toast title', () => {
    setup()
    show('Saved budget')

    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toHaveAccessibleDescription('Saved budget')
  })

  it('moves focus to the next toast\'s dismiss button, never its action', async () => {
    const user = setup()
    show('First')
    show('Second', { action: { label: 'Undo', onAction: () => undefined } })

    await user.tab()
    expect(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveFocus()
  })

  it('moves focus to the promoted queued toast\'s dismiss button after an action on the last visible toast', async () => {
    const user = setup()
    show('One')
    show('Two')
    show('Three', { action: { label: 'Undo', onAction: () => undefined } })
    show('Four', { action: { label: 'Retry', onAction: () => undefined } })

    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()
    await user.keyboard('{Enter}')
    const promoted = screen.getByRole('article', { name: 'Four' })
    expect(within(promoted).getByRole('button', { name: 'Dismiss notification' })).toHaveFocus()
    expect(within(promoted).getByRole('button', { name: 'Retry' })).not.toHaveFocus()
  })

  it('drops the focus request when the toast is already gone at dismiss time', async () => {
    const user = setup()
    const id = show('First', { action: { label: 'Undo', onAction: () => { dismiss(id) } } })
    show('Second')

    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).not.toHaveFocus()
  })

  it('runs the action and dismisses the toast', async () => {
    const user = setup()
    const onAction = vi.fn<() => void>()
    show('Categorised 3 transactions', { action: { label: 'Undo', onAction } })

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('dismisses with the close button and resumes timers once focus and pointer leave', async () => {
    const user = setup()
    show('First')
    show('Second')

    await user.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0] ?? document.body)
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toHaveFocus()
    act(() => {
      screen.getByRole('button', { name: 'Dismiss notification' }).blur()
    })
    await user.hover(screen.getByRole('status'))
    await user.unhover(screen.getByRole('status'))
    advance(6000)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('shows at most three and queues the rest without running their timers', () => {
    setup()
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
      show(title)
    }

    expect(screen.getAllByRole('article').map((article) => article.textContent)).toEqual(['One', 'Two', 'Three'])
    advance(6000)
    expect(screen.getAllByRole('article').map((article) => article.textContent)).toEqual(['Four', 'Five'])
    advance(6000)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
