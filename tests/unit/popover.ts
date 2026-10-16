const OPEN_ATTRIBUTE = 'data-popover-open'

class TestToggleEvent extends Event {
  readonly oldState: string
  readonly newState: string

  constructor(type: string, init: { readonly oldState: string; readonly newState: string }) {
    super(type)
    this.oldState = init.oldState
    this.newState = init.newState
  }
}

const openAutoPopovers: HTMLElement[] = []

function popoverMode(element: HTMLElement): 'auto' | 'manual' {
  const value = element.getAttribute('popover')

  if (value === null) {
    throw new DOMException('The element is not a popover.', 'NotSupportedError')
  }

  return value === 'manual' ? 'manual' : 'auto'
}

function setPopoverOpen(element: HTMLElement, open: boolean): void {
  const mode = popoverMode(element)

  if (element.hasAttribute(OPEN_ATTRIBUTE) === open) {
    return
  }

  if (open) {
    if (mode === 'auto') {
      for (const other of [...openAutoPopovers]) {
        setPopoverOpen(other, false)
      }
      openAutoPopovers.push(element)
    }
    element.setAttribute(OPEN_ATTRIBUTE, '')
  } else {
    element.removeAttribute(OPEN_ATTRIBUTE)
    const index = openAutoPopovers.indexOf(element)
    if (index !== -1) {
      openAutoPopovers.splice(index, 1)
    }
  }

  element.dispatchEvent(new TestToggleEvent('toggle', {
    oldState: open ? 'closed' : 'open',
    newState: open ? 'open' : 'closed',
  }))
}

function handleInvokerClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) {
    return
  }

  const invoker = event.target.closest('button[popovertarget]')
  const targetId = invoker?.getAttribute('popovertarget')
  const target = targetId === null || targetId === undefined ? null : document.getElementById(targetId)

  if (invoker === null || target === null || invoker.matches(':disabled')) {
    return
  }

  const action = invoker.getAttribute('popovertargetaction') ?? 'toggle'
  setPopoverOpen(target, action === 'toggle' ? !target.hasAttribute(OPEN_ATTRIBUTE) : action === 'show')
}

function handleLightDismiss(event: PointerEvent): void {
  if (!(event.target instanceof Node)) {
    return
  }

  for (const popover of [...openAutoPopovers]) {
    const invoker = event.target instanceof Element ? event.target.closest(`[popovertarget="${popover.id}"]`) : null
    if (!popover.contains(event.target) && invoker === null) {
      setPopoverOpen(popover, false)
    }
  }
}

function handleEscape(event: KeyboardEvent): void {
  const topmost = openAutoPopovers.at(-1)

  if (event.key === 'Escape' && !event.defaultPrevented && topmost !== undefined) {
    setPopoverOpen(topmost, false)
  }
}

export function installPopoverPolyfill(): void {
  if (typeof HTMLElement === 'undefined' || Reflect.has(HTMLElement.prototype, 'showPopover')) {
    return
  }

  HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
    setPopoverOpen(this, true)
  }
  HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
    setPopoverOpen(this, false)
  }
  HTMLElement.prototype.togglePopover = function togglePopover(this: HTMLElement, force?: boolean | { force?: boolean }) {
    const requested = typeof force === 'object' ? force.force : force
    const next = requested ?? !this.hasAttribute(OPEN_ATTRIBUTE)
    setPopoverOpen(this, next)
    return next
  }

  const nativeMatches: unknown = Reflect.get(Element.prototype, 'matches')
  if (typeof nativeMatches !== 'function') {
    throw new Error('Element.prototype.matches is missing.')
  }
  Object.defineProperty(Element.prototype, 'matches', {
    configurable: true,
    writable: true,
    value: function matches(this: Element, selectors: string): boolean {
      return Reflect.apply(nativeMatches, this, [selectors.replaceAll(':popover-open', `[${OPEN_ATTRIBUTE}]`)]) === true
    },
  })

  const style = document.createElement('style')
  style.textContent = `[popover]:not([${OPEN_ATTRIBUTE}]) { display: none; } :is(#outrank-user-agent, [popover][${OPEN_ATTRIBUTE}]) { display: block; }`
  document.head.append(style)

  document.addEventListener('click', handleInvokerClick)
  document.addEventListener('pointerdown', handleLightDismiss, true)
  document.addEventListener('keydown', handleEscape)
}

export function resetPopovers(): void {
  for (const popover of [...openAutoPopovers]) {
    setPopoverOpen(popover, false)
  }
}
