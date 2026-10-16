export interface CanvasCall {
  readonly name: string
  readonly args: readonly unknown[]
}

export interface RecordedPattern {
  readonly kind: 'pattern'
  transform: unknown
  readonly setTransform: (transform: unknown) => void
}

const records = new WeakMap<HTMLCanvasElement, CanvasCall[]>()
const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()

function recordingContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const calls: CanvasCall[] = []
  const state = new Map<PropertyKey, unknown>([['canvas', canvas]])
  records.set(canvas, calls)

  const context = new Proxy({}, {
    get(_, key) {
      if (state.has(key)) {
        return state.get(key)
      }
      if (key === 'measureText') {
        return (text: unknown) => ({ width: String(text).length * 6 })
      }
      if (key === 'createPattern') {
        return (...args: unknown[]) => {
          const pattern: RecordedPattern = { kind: 'pattern', transform: null, setTransform: (transform: unknown) => {
            pattern.transform = transform
          } }
          calls.push({ name: 'createPattern', args })
          return pattern
        }
      }
      return (...args: unknown[]) => {
        calls.push({ name: String(key), args })
      }
    },
    set(_, key, value: unknown) {
      state.set(key, value)
      calls.push({ name: `set ${String(key)}`, args: [value] })
      return true
    },
  })

  return context as CanvasRenderingContext2D
}

export function installCanvasStub(): void {
  if (typeof HTMLCanvasElement === 'undefined') {
    return
  }

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(this: HTMLCanvasElement, kind: string) {
      if (kind !== '2d') {
        return null
      }
      const existing = contexts.get(this)
      if (existing !== undefined) {
        return existing
      }
      const created = recordingContext(this)
      contexts.set(this, created)
      return created
    },
  })
}

export function canvasCalls(canvas: Element | null): readonly CanvasCall[] {
  return canvas instanceof HTMLCanvasElement ? records.get(canvas) ?? [] : []
}

export function fakeResizeObserver(width: number, height: number): typeof ResizeObserver {
  class FakeResizeObserver {
    readonly #callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback
    }

    observe(target: Element): void {
      const entry = { target, contentRect: { width, height }, devicePixelContentBoxSize: [{ inlineSize: width * 2, blockSize: height * 2 }] }
      queueMicrotask(() => {
        this.#callback([entry as unknown as ResizeObserverEntry], this)
      })
    }

    unobserve(): void {
      return
    }

    disconnect(): void {
      return
    }
  }

  return FakeResizeObserver
}
