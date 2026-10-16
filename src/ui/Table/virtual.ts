export const OVERSCAN_ROWS = 4

export const FALLBACK_ROW_HEIGHT = 36

export interface VirtualWindow {
  readonly first: number
  readonly clear: number
  readonly last: number
  readonly rowHeight: number
}

export interface VirtualRange {
  readonly start: number
  readonly end: number
}

export const viewport = {
  height: (): number => window.innerHeight,
  top: (element: Element): number => element.getBoundingClientRect().top,
  bottom: (element: Element): number => element.getBoundingClientRect().bottom,
  blockSize: (element: Element | null): number => element?.getBoundingClientRect().height ?? 0,
  reveal: (element: Element): void => {
    element.scrollIntoView({ block: 'nearest' })
  },
}

export interface ViewGeometry {
  readonly top: number
  readonly height: number
  readonly rowHeight: number
  readonly stickyHeight: number
}

export function measureGeometry(body: Element, head: Element | null, fallbackRowHeight: number): ViewGeometry {
  const sample = body.querySelector('tr[aria-rowindex]:not([data-sentinel])')
  const rowHeight = viewport.blockSize(sample) || fallbackRowHeight
  const height = viewport.height()
  const stickyHeight = head === null ? 0 : Math.min(height, Math.max(0, viewport.bottom(head)))
  return { top: viewport.top(body), height, rowHeight, stickyHeight }
}

export function readWindow(top: number, height: number, rowHeight: number, stickyHeight = 0): VirtualWindow {
  const offset = -top
  const first = Math.max(0, Math.floor(offset / rowHeight))
  const clear = Math.max(first, Math.ceil((stickyHeight - top) / rowHeight))
  const last = Math.max(first, Math.floor((offset + height - 1) / rowHeight))
  return { first, clear: Math.min(clear, last), last, rowHeight }
}

export function pageStep({ top, height, rowHeight, stickyHeight }: ViewGeometry): number {
  const bandStart = Math.min(height, Math.max(stickyHeight, top))
  return Math.max(1, Math.ceil((height - bandStart) / rowHeight) - 1)
}

export function windowAround(index: number, view: VirtualWindow, count: number): VirtualWindow {
  const visible = view.last - view.first + 1
  const first = Math.max(0, Math.min(index - Math.floor(visible / 2), count - visible))
  return { first, clear: first, last: first + visible - 1, rowHeight: view.rowHeight }
}

export function sameWindow(left: VirtualWindow, right: VirtualWindow): boolean {
  return left.first === right.first && left.clear === right.clear && left.last === right.last && left.rowHeight === right.rowHeight
}

export function windowRange(view: VirtualWindow, count: number): VirtualRange {
  const start = Math.min(count, Math.max(0, view.first - OVERSCAN_ROWS))
  const end = Math.min(count, view.last + 1 + OVERSCAN_ROWS)
  return { start, end: Math.max(start, end) }
}
