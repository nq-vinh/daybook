const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const modalStack: HTMLDialogElement[] = []

function handleEscape(event: KeyboardEvent): void {
  const topmost = modalStack.at(-1)

  if (event.key !== 'Escape' || event.defaultPrevented || topmost === undefined) {
    return
  }

  const cancel = new Event('cancel', { cancelable: true })
  if (topmost.dispatchEvent(cancel)) {
    topmost.close()
  }
}

export function closeWithoutCancelableCancel(dialog: HTMLDialogElement): void {
  dialog.dispatchEvent(new Event('cancel', { cancelable: false }))
  dialog.close()
}

export function installDialogPolyfill(): void {
  if (typeof HTMLDialogElement === 'undefined' || Reflect.has(HTMLDialogElement.prototype, 'showModal')) {
    return
  }

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    if (this.hasAttribute('open')) {
      throw new DOMException('The dialog is already open.', 'InvalidStateError')
    }

    this.setAttribute('open', '')
    modalStack.push(this)
    const first = this.querySelector('[autofocus]') ?? this.querySelector(FOCUSABLE)
    if (first instanceof HTMLElement) {
      first.focus()
    }
  }

  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.hasAttribute('open')) {
      return
    }

    if (returnValue !== undefined) {
      this.returnValue = returnValue
    }
    this.removeAttribute('open')
    const index = modalStack.indexOf(this)
    if (index !== -1) {
      modalStack.splice(index, 1)
    }
    this.dispatchEvent(new Event('close'))
  }

  document.addEventListener('keydown', handleEscape)
}
