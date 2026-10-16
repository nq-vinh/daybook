const TILE_CSS_PX = 6
const LINE_CSS_PX = 1.5

export function hatchPattern(context: CanvasRenderingContext2D, colour: string, dpr: number): CanvasPattern | null {
  const tile = document.createElement('canvas')
  const size = Math.max(1, Math.round(TILE_CSS_PX * dpr))
  tile.width = size
  tile.height = size
  const tileContext = tile.getContext('2d')

  if (tileContext === null) {
    return null
  }

  tileContext.strokeStyle = colour
  tileContext.lineWidth = LINE_CSS_PX * dpr
  tileContext.lineCap = 'square'
  tileContext.beginPath()
  tileContext.moveTo(0, size)
  tileContext.lineTo(size, 0)
  tileContext.moveTo(-size / 2, size / 2)
  tileContext.lineTo(size / 2, -size / 2)
  tileContext.moveTo(size / 2, size * 1.5)
  tileContext.lineTo(size * 1.5, size / 2)
  tileContext.stroke()

  const pattern = context.createPattern(tile, 'repeat')
  pattern?.setTransform({ a: 1 / dpr, b: 0, c: 0, d: 1 / dpr, e: 0, f: 0 })
  return pattern
}
