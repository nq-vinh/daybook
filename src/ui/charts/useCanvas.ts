import { useEffect, useRef, type RefCallback } from 'react'

import { recordDrawRate } from '../../state/hud'
import { useResolvedScheme } from '../../state/theme'
import { createDrawRateMeter, type DrawRateMeter } from './drawRate'
import { hatchPattern } from './hatch'

export interface CanvasFrame {
  readonly context: CanvasRenderingContext2D
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly timestamp: number
  readonly font: (sizeToken: string) => string
  readonly fontSize: (sizeToken: string) => number
  readonly colour: (token: string) => string
  readonly hatch: (token: string) => CanvasPattern | string
  readonly duration: (token: string) => number
}

export type CanvasDraw = (frame: CanvasFrame) => boolean | undefined

export interface CanvasOptions {
  readonly measureDrawRate?: boolean | undefined
}

interface CanvasSize {
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
}

interface CanvasControl {
  request(): void
  invalidate(): void
}

type ResolvedProperty = 'color' | 'font-size' | 'transition-duration'

const IDLE_CONTROL: CanvasControl = { request: () => undefined, invalidate: () => undefined }
const STYLE_QUERIES = ['(prefers-contrast: more)', '(forced-colors: active)', '(prefers-reduced-motion: reduce)'] as const
const DPR_TOLERANCE = 0.01

function tokenCache(canvas: HTMLCanvasElement) {
  const values = new Map<string, string>()
  const sized = new Map<string, string>()
  const patterns = new Map<string, CanvasPattern | null>()
  let sizeKey = ''

  function resolve(property: ResolvedProperty, token: string, cache = values): string {
    const cacheKey = `${property}|${token}`
    const cached = cache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }
    const value = getComputedStyle(canvas.parentElement ?? canvas).getPropertyValue(token).trim()
    canvas.style.setProperty(property, value === '' ? `var(${token})` : value)
    const resolved = getComputedStyle(canvas).getPropertyValue(property)
    canvas.style.removeProperty(property)
    cache.set(cacheKey, resolved)
    return resolved
  }

  function family(): string {
    const cached = values.get('font-family')
    if (cached !== undefined) {
      return cached
    }
    const resolved = getComputedStyle(canvas.parentElement ?? canvas).fontFamily
    values.set('font-family', resolved)
    return resolved
  }

  function fontSize(token: string): number {
    return Number.parseFloat(resolve('font-size', token, sized)) || 12
  }

  return {
    clear(): void {
      values.clear()
      sized.clear()
      patterns.clear()
    },
    frame(context: CanvasRenderingContext2D, dpr: number) {
      const nextSizeKey = `${String(dpr)}|${String(window.devicePixelRatio)}|${String(window.innerWidth)}`
      if (nextSizeKey !== sizeKey) {
        sizeKey = nextSizeKey
        sized.clear()
        patterns.clear()
      }
      const colour = (token: string): string => resolve('color', token)
      return {
        colour,
        fontSize,
        font: (token: string) => `${String(fontSize(token))}px ${family()}`,
        hatch: (token: string): CanvasPattern | string => {
          if (!patterns.has(token)) {
            patterns.set(token, hatchPattern(context, colour(token), dpr))
          }
          return patterns.get(token) ?? colour(token)
        },
        duration: (token: string) => {
          const value = resolve('transition-duration', token)
          const amount = Number.parseFloat(value)
          return Number.isFinite(amount) ? (value.endsWith('ms') ? amount : amount * 1000) : 0
        },
      }
    },
  }
}

function measure(entry: ResizeObserverEntry): CanvasSize {
  const dpr = window.devicePixelRatio || 1
  const { width, height } = entry.contentRect
  const device = (entry.devicePixelContentBoxSize as readonly ResizeObserverSize[] | undefined)?.[0]
  const trusted = device !== undefined && width > 0 && Math.abs(device.inlineSize / width / dpr - 1) <= DPR_TOLERANCE
  return {
    width,
    height,
    pixelWidth: trusted ? device.inlineSize : Math.round(width * dpr),
    pixelHeight: trusted ? device.blockSize : Math.round(height * dpr),
  }
}

function watchMedia(queries: readonly string[], changed: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const lists = queries.map((query) => window.matchMedia(query))
  for (const list of lists) {
    list.addEventListener('change', changed)
  }
  return () => {
    for (const list of lists) {
      list.removeEventListener('change', changed)
    }
  }
}

function watchResolution(changed: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined
  }

  let query = window.matchMedia(`(resolution: ${String(window.devicePixelRatio || 1)}dppx)`)

  function handleChange(): void {
    query.removeEventListener('change', handleChange)
    query = window.matchMedia(`(resolution: ${String(window.devicePixelRatio || 1)}dppx)`)
    query.addEventListener('change', handleChange)
    changed()
  }

  query.addEventListener('change', handleChange)
  return () => {
    query.removeEventListener('change', handleChange)
  }
}

export function useCanvas(draw: CanvasDraw, { measureDrawRate = false }: CanvasOptions = {}): RefCallback<HTMLCanvasElement> {
  const scheme = useResolvedScheme()
  const drawRef = useRef(draw)
  const schemeRef = useRef(scheme)
  const controlRef = useRef<CanvasControl>(IDLE_CONTROL)

  useEffect(() => {
    drawRef.current = draw
    if (schemeRef.current !== scheme) {
      schemeRef.current = scheme
      controlRef.current.invalidate()
    }
    controlRef.current.request()
  }, [draw, scheme])

  return (node) => {
    if (node === null || typeof ResizeObserver === 'undefined') {
      return
    }

    const canvas = node
    const meter: DrawRateMeter | null = measureDrawRate ? createDrawRateMeter(recordDrawRate) : null
    const tokens = tokenCache(canvas)
    let size: CanvasSize | null = null
    let frame = 0
    let dirty = true

    function tick(timestamp: number): void {
      frame = 0
      const context = canvas.getContext('2d')

      if (!dirty || context === null || size === null) {
        meter?.end(timestamp)
        return
      }

      dirty = false
      if (canvas.width !== size.pixelWidth || canvas.height !== size.pixelHeight) {
        canvas.width = size.pixelWidth
        canvas.height = size.pixelHeight
      }
      const dpr = size.width === 0 ? 1 : size.pixelWidth / size.width
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const animating = drawRef.current({ context, width: size.width, height: size.height, dpr, timestamp, ...tokens.frame(context, dpr) }) === true
      meter?.frame(timestamp)
      dirty = animating
      frame = requestAnimationFrame(tick)
    }

    function request(): void {
      dirty = true
      if (frame === 0 && size !== null) {
        frame = requestAnimationFrame(tick)
      }
    }

    function restyle(): void {
      tokens.clear()
      request()
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        size = measure(entry)
        request()
      }
    })

    let stopResolution = (): void => undefined
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' })
    } catch {
      observer.observe(canvas)
      stopResolution = watchResolution(() => {
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        size = { width: rect.width, height: rect.height, pixelWidth: Math.round(rect.width * dpr), pixelHeight: Math.round(rect.height * dpr) }
        request()
      })
    }
    const stopStyles = watchMedia(STYLE_QUERIES, restyle)
    controlRef.current = {
      request,
      invalidate: () => {
        tokens.clear()
      },
    }

    return () => {
      observer.disconnect()
      stopResolution()
      stopStyles()
      cancelAnimationFrame(frame)
      controlRef.current = IDLE_CONTROL
    }
  }
}
