import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Menu, type MenuEntry } from './Menu'

function setup() {
  const onSelect = vi.fn<(id: string) => void>()
  const items: MenuEntry[] = [
    { id: 'edit', label: 'Edit budget', onSelect: () => { onSelect('edit') } },
    { id: 'duplicate', label: 'Duplicate', onSelect: () => { onSelect('duplicate') } },
    { id: 'archive', label: 'Archive', onSelect: () => { onSelect('archive') }, disabled: true },
    { kind: 'separator', id: 'separator' },
    { id: 'delete', label: 'Delete budget', onSelect: () => { onSelect('delete') } },
  ]
  render(<Menu label="Budget actions" items={items} />)
  return { onSelect, user: userEvent.setup(), trigger: screen.getByRole('button', { name: 'Budget actions' }) }
}

describe('Menu', () => {
  it('renders a closed menu button wired to its popover', () => {
    const { trigger } = setup()

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const panel = document.getElementById(trigger.getAttribute('popovertarget') ?? '')
    expect(panel).toHaveAttribute('popover', 'auto')
    expect(panel).toHaveAttribute('aria-labelledby', trigger.id)
  })

  it('opens on click, focuses the first item and exposes a separator', async () => {
    const { user, trigger } = setup()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Budget actions' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toHaveFocus()
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').filter((item) => item.tabIndex === 0)).toHaveLength(1)
  })

  it('moves focus with arrows, wraps, skips disabled items and supports Home and End', async () => {
    const { user, trigger } = setup()

    trigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toHaveAttribute('tabindex', '0')
  })

  it('jumps by first character, cycling through matches', async () => {
    const { user, trigger } = setup()

    await user.click(trigger)
    await user.keyboard('d')
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus()
    await user.keyboard('D')
    expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toHaveFocus()
    await user.keyboard('a')
    expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toHaveFocus()
  })

  it('activates with Enter and Space, closes and returns focus to the trigger', async () => {
    const { user, trigger, onSelect } = setup()

    trigger.focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('duplicate')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()

    await user.keyboard('{Enter}{End}[Space]')
    expect(onSelect).toHaveBeenLastCalledWith('delete')
    expect(trigger).toHaveFocus()
  })

  it('opens from the trigger with ArrowDown on the first item and ArrowUp on the last', async () => {
    const { user, trigger } = setup()

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toHaveFocus()
    await user.keyboard('{Escape}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toHaveFocus()
  })

  it('ignores activation once the panel is closing', async () => {
    const { user, trigger, onSelect } = setup()

    await user.click(trigger)
    const item = screen.getByRole('menuitem', { name: 'Duplicate' })
    const panel = screen.getByRole('menu')
    act(() => {
      panel.hidePopover()
    })
    fireEvent.click(item)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ignores clicks on disabled items', async () => {
    const { user, trigger, onSelect } = setup()

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeVisible()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user, trigger } = setup()

    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on an outside click without stealing focus back', async () => {
    const { user, trigger } = setup()
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    document.body.append(outside)

    await user.click(trigger)
    await user.click(outside)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(outside).toHaveFocus()
    outside.remove()
  })

  it('renders an icon-only trigger named by its label', () => {
    render(<Menu label="More actions" icon="more-horizontal" iconOnly items={[]} />)

    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute('aria-haspopup', 'menu')
  })
})
