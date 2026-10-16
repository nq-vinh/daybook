import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Switch } from './Switch'

const switchCss = readFileSync(join(process.cwd(), 'src/ui/Switch/Switch.module.css'), 'utf8')

function rules(css: string): Array<{ readonly selector: string; readonly body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' }))
}

function ControlledSwitch({ onChange }: { readonly onChange: (checked: boolean) => void }) {
  const [frozen, setFrozen] = useState(true)

  return (
    <Switch
      label="Card frozen"
      checked={frozen}
      onChange={(event) => {
        setFrozen(event.target.checked)
        onChange(event.target.checked)
      }}
    />
  )
}

describe('Switch', () => {
  it('exposes switch semantics on a native checkbox', () => {
    render(<Switch label="Live feed" />)
    const control = screen.getByRole('switch', { name: 'Live feed' })

    expect(control).toHaveAttribute('type', 'checkbox')
    expect(control).not.toHaveAttribute('aria-checked')
    expect(control).not.toBeChecked()
  })

  it('toggles on Space and click, not on Enter', async () => {
    const user = userEvent.setup()
    render(<Switch label="Live feed" />)
    const control = screen.getByRole('switch', { name: 'Live feed' })

    await user.tab()
    expect(control).toHaveFocus()
    await user.keyboard(' ')
    expect(control).toBeChecked()
    await user.keyboard('{Enter}')
    expect(control).toBeChecked()
    await user.click(screen.getByText('Live feed'))
    expect(control).not.toBeChecked()
  })

  it('starts from defaultChecked when uncontrolled', () => {
    render(<Switch label="Live feed" defaultChecked />)

    expect(screen.getByRole('switch', { name: 'Live feed' })).toBeChecked()
  })

  it('passes the native change event through and follows a controlled value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ControlledSwitch onChange={onChange} />)
    const control = screen.getByRole('switch', { name: 'Card frozen' })

    expect(control).toBeChecked()
    await user.click(control)
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(control).not.toBeChecked()
  })

  it('moves the thumb only for a checked input and keeps the unchecked thumb muted against the track', () => {
    const { container } = render(<Switch label="Live feed" />)
    const control = screen.getByRole('switch', { name: 'Live feed' })
    const track = control.nextElementSibling

    expect(track?.querySelector(':scope > span')).not.toBeNull()
    expect(control.matches(':checked')).toBe(false)
    control.click()
    expect(control.matches(':checked')).toBe(true)
    expect(container.querySelector('input:checked + span > span')).not.toBeNull()

    const parsed = rules(switchCss)
    const translating = parsed.filter((rule) => /(^|[;\s])translate:/.test(rule.body))
    expect(translating.map((rule) => rule.selector)).toEqual(['.input:where(:checked) + .track .thumb'])
    expect(parsed.find((rule) => rule.selector === '.thumb')?.body).toContain('background: var(--color-text-muted)')
    expect(parsed.filter((rule) => rule.selector === '.thumb')).toHaveLength(1)
    expect(parsed.map((rule) => rule.selector)).toContain('.track:dir(rtl)')
    expect(parsed.some((rule) => rule.selector.includes('.track .track'))).toBe(false)
  })
})
