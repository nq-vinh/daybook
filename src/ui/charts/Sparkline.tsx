import { useRef } from 'react'

import { cx } from '../classes'
import styles from './Sparkline.module.css'
import { linearScale } from './scales'
import { type CanvasFrame, useCanvas } from './useCanvas'

export interface SparklineProps {
  readonly points: readonly number[]
  readonly label: string
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly className?: string | undefined
}

const LINE_WIDTH = 2
const DOT_RADIUS = 4
const RING_WIDTH = 2
const INSET = DOT_RADIUS + RING_WIDTH

function sizeRef(width: number, height: number) {
  return (canvas: HTMLCanvasElement | null) => {
    canvas?.style.setProperty('--sparkline-width', `${String(width)}px`)
    canvas?.style.setProperty('--sparkline-height', `${String(height)}px`)
  }
}

export function drawSparkline(frame: CanvasFrame, points: readonly number[], progress: number): void {
  const { context, width, height } = frame
  if (points.length === 0) {
    return
  }
  const x = linearScale([0, Math.max(1, points.length - 1)], [INSET, width - INSET])
  const y = linearScale([Math.min(...points), Math.max(...points)], [height - INSET, INSET])
  const reach = progress * (points.length - 1)
  const whole = Math.floor(reach)
  const ink = frame.colour('--color-text')

  context.strokeStyle = ink
  context.lineWidth = LINE_WIDTH
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.beginPath()
  points.slice(0, whole + 1).forEach((point, index) => {
    if (index === 0) {
      context.moveTo(x(index), y(point))
    } else {
      context.lineTo(x(index), y(point))
    }
  })
  const from = points[whole]
  const to = points[whole + 1]
  if (from !== undefined && to !== undefined && reach > whole) {
    const fraction = reach - whole
    context.lineTo(x(whole + fraction), y(from + (to - from) * fraction))
  }
  context.stroke()

  const lastPoint = points.at(-1)
  if (progress >= 1 && lastPoint !== undefined) {
    context.beginPath()
    context.arc(x(points.length - 1), y(lastPoint), DOT_RADIUS + RING_WIDTH, 0, Math.PI * 2)
    context.fillStyle = frame.colour('--color-surface')
    context.fill()
    context.beginPath()
    context.arc(x(points.length - 1), y(lastPoint), DOT_RADIUS, 0, Math.PI * 2)
    context.fillStyle = ink
    context.fill()
  }
}

export function Sparkline({ points, label, width = 120, height = 32, className }: SparklineProps) {
  const startRef = useRef<number | null>(null)
  const canvasRef = useCanvas((frame) => {
    const duration = frame.duration('--duration-base')
    startRef.current ??= frame.timestamp
    const progress = duration <= 0 ? 1 : Math.min(1, (frame.timestamp - startRef.current) / duration)
    drawSparkline(frame, points, progress)
    return progress < 1
  })

  return (
    <canvas
      ref={(canvas) => {
        sizeRef(width, height)(canvas)
        return canvasRef(canvas)
      }}
      className={cx(styles.sparkline, className)}
      role="img"
      aria-label={label}
    />
  )
}
