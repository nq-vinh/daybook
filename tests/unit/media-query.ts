export class FakeMediaQueryList extends EventTarget {
  matches = false
  readonly media: string
  onchange = null

  constructor(media: string) {
    super()
    this.media = media
  }

  addListener(): void {
    throw new Error('Use addEventListener.')
  }

  removeListener(): void {
    throw new Error('Use removeEventListener.')
  }

  setMatches(matches: boolean): void {
    this.matches = matches
    this.dispatchEvent(new Event('change'))
  }
}
