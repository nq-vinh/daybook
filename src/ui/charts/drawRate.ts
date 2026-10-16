export interface DrawRateMeter {
  frame(timestamp: number): void
  end(timestamp: number): void
}

export function createDrawRateMeter(report: (framesPerSecond: number) => void): DrawRateMeter {
  let first: number | null = null
  let frames = 0

  return {
    frame(timestamp) {
      first ??= timestamp
      frames += 1
    },
    end(timestamp) {
      if (first !== null && frames > 0 && timestamp > first) {
        report((frames * 1000) / (timestamp - first))
      }
      first = null
      frames = 0
    },
  }
}
