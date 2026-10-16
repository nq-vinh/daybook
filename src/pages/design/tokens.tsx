import { useState, useSyncExternalStore } from 'react'

import { useResolvedScheme, type ResolvedScheme } from '../../state/theme'
import { cx } from '../../ui/classes'
import { contrastBetween, contrastLevel, formatRatio } from '../../ui/contrast'
import {
  colourTokens,
  contrastPairs,
  durationTokens,
  layerTokens,
  radiusTokens,
  spaceTokens,
  textTokens,
  type ContrastPair,
  type MeasuredToken,
} from './data'
import styles from './design.module.css'
import { cssProperties, DataTable, Section, Swatch } from './section'

interface Probe {
  readonly set: string
  readonly read: string
}

const COLOUR: Probe = { set: 'background-color', read: 'background-color' }
const FONT_SIZE: Probe = { set: 'font-size', read: 'font-size' }
const LENGTH: Probe = { set: 'inline-size', read: 'inline-size' }
const RADIUS: Probe = { set: 'border-radius', read: 'border-top-left-radius' }
const SHADOW: Probe = { set: 'box-shadow', read: 'box-shadow' }
const DURATION: Probe = { set: 'transition-duration', read: 'transition-duration' }
const DELAY: Probe = { set: 'transition-delay', read: 'transition-delay' }
const EASING: Probe = { set: 'transition-timing-function', read: 'transition-timing-function' }
const LAYER: Probe = { set: 'z-index', read: 'z-index' }

const probed = (tokens: readonly MeasuredToken[], probe: Probe) => tokens.map(({ name }) => [name, probe] as const)

const probes: readonly (readonly [string, Probe])[] = [
  ...probed(colourTokens, COLOUR),
  ...probed(textTokens, FONT_SIZE),
  ...probed(spaceTokens, LENGTH),
  ...probed(radiusTokens, RADIUS),
  ['--shadow-raised', SHADOW],
  ...durationTokens.map(({ name }) => [name, name.startsWith('--delay-') ? DELAY : DURATION] as const),
  ['--ease-out', EASING],
  ...probed(layerTokens, LAYER),
]

function mediaQueryStore(query: string) {
  return {
    subscribe: (listener: () => void): (() => void) => {
      if (typeof window.matchMedia !== 'function') {
        return () => undefined
      }

      const list = window.matchMedia(query)
      list.addEventListener('change', listener)
      return () => {
        list.removeEventListener('change', listener)
      }
    },
    getSnapshot: (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  }
}

const reducedMotionStore = mediaQueryStore('(prefers-reduced-motion: reduce)')
const moreContrastStore = mediaQueryStore('(prefers-contrast: more)')
const forcedColoursStore = mediaQueryStore('(forced-colors: active)')

interface Resolved {
  readonly declared: string
  readonly value: string
}

export interface Measurement {
  readonly key: string
  readonly scheme: ResolvedScheme
  readonly width: number
  readonly reducedMotion: boolean
  readonly moreContrast: boolean
  readonly forcedColours: boolean
  readonly tokens: ReadonlyMap<string, Resolved>
}

interface MeasurementProps {
  readonly measurement: Measurement | null
}

function measure(probe: HTMLElement): Map<string, Resolved> {
  const root = getComputedStyle(document.documentElement)
  const computed = getComputedStyle(probe)
  const tokens = new Map<string, Resolved>()

  for (const [name, { set, read }] of probes) {
    probe.style.setProperty(set, `var(${name})`)
    tokens.set(name, { declared: root.getPropertyValue(name).trim(), value: computed.getPropertyValue(read).trim() })
    probe.style.removeProperty(set)
  }

  return tokens
}

function subscribeResize(listener: () => void): () => void {
  let frame = 0

  function handleResize() {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0
        listener()
      })
    }
  }

  window.addEventListener('resize', handleResize)
  return () => {
    window.removeEventListener('resize', handleResize)
    cancelAnimationFrame(frame)
  }
}

function getViewportWidth(): number {
  return window.innerWidth
}

export function useTokenMeasurement() {
  const scheme = useResolvedScheme()
  const width = useSyncExternalStore(subscribeResize, getViewportWidth)
  const reducedMotion = useSyncExternalStore(reducedMotionStore.subscribe, reducedMotionStore.getSnapshot)
  const moreContrast = useSyncExternalStore(moreContrastStore.subscribe, moreContrastStore.getSnapshot)
  const forcedColours = useSyncExternalStore(forcedColoursStore.subscribe, forcedColoursStore.getSnapshot)
  const key = [scheme, width, reducedMotion, moreContrast, forcedColours].map(String).join(' ')
  const [measurement, setMeasurement] = useState<Measurement | null>(null)

  function probeRef(probe: HTMLSpanElement | null) {
    if (probe !== null && measurement?.key !== key) {
      setMeasurement({ key, scheme, width, reducedMotion, moreContrast, forcedColours, tokens: measure(probe) })
    }
  }

  return {
    measurement,
    probe: <span key={key} ref={probeRef} className={styles.probe} aria-hidden="true" />,
  }
}

function pixels(value: string | undefined): string {
  const amount = value?.endsWith('px') === true ? Number.parseFloat(value) : Number.NaN
  return Number.isFinite(amount) ? `${String(Math.round(amount * 100) / 100)} px` : 'unmeasured'
}

function milliseconds(value: string | undefined): string {
  const match = value === undefined ? null : /^(-?[\d.]+)(ms|s)$/.exec(value)
  const amount = match?.[1] === undefined ? Number.NaN : Number.parseFloat(match[1])

  if (!Number.isFinite(amount)) {
    return 'unmeasured'
  }

  return `${String(Math.round(match?.[2] === 's' ? amount * 1000 : amount))} ms`
}

function resolvedOf(measurement: Measurement | null, name: string): Resolved | undefined {
  return measurement?.tokens.get(name)
}

function ContrastSample({ pair }: { readonly pair: ContrastPair }) {
  const properties = { '--sample-foreground': `var(${pair.foreground})`, '--sample-background': `var(${pair.background})` }

  if (pair.kind === 'non-text') {
    return <span className={styles.sampleEdge} ref={cssProperties(properties)} aria-hidden="true" />
  }

  return <span className={styles.sample} ref={cssProperties(properties)} aria-hidden="true">Aa 1,240.00</span>
}

function ColourSection({ measurement }: MeasurementProps) {
  return (
    <Section id="colour" title="Colour">
      <p>
        Each colour is resolved by painting it on a hidden probe and reading the computed colour back, so <code>light-dark()</code> is
        settled by the browser for the active theme. Ratios use the WCAG 2.1 relative luminance formula and are cut, not rounded, to two
        decimals so a shown value never flatters the measurement.
      </p>
      <p data-measured-scheme={measurement?.scheme}>
        {measurement === null
          ? 'Measuring.'
          : `Measured in the ${measurement.scheme} theme${measurement.moreContrast ? ' with more contrast requested' : ''}${measurement.forcedColours ? ' with forced colours' : ''}. Switch the theme and every value here is measured again.`}
      </p>
      <DataTable className={styles.data} caption="Contrast pairs">
        <thead>
          <tr>
            <th scope="col">Sample</th>
            <th scope="col">Foreground</th>
            <th scope="col">Background</th>
            <th scope="col" className={styles.numeric}>Ratio</th>
            <th scope="col" className={styles.numeric}>Needs</th>
            <th scope="col">Level</th>
          </tr>
        </thead>
        <tbody>
          {contrastPairs.map((pair) => {
            const foreground = resolvedOf(measurement, pair.foreground)
            const background = resolvedOf(measurement, pair.background)
            const ratio = foreground === undefined || background === undefined ? null : contrastBetween(foreground.value, background.value)
            const shown = ratio === null ? null : formatRatio(ratio)

            return (
              <tr
                key={`${pair.foreground} on ${pair.background}`}
                data-contrast-pair=""
                data-ratio={shown ?? 'unmeasured'}
                data-minimum={String(pair.minimum)}
              >
                <td><ContrastSample pair={pair} /></td>
                <td><code>{pair.foreground}</code></td>
                <td><code>{pair.background}</code></td>
                <td className={styles.numeric}>{shown === null ? 'unmeasured' : `${shown}:1`}</td>
                <td className={styles.numeric}>{`${String(pair.minimum)}:1 ${pair.kind}`}</td>
                <td>{ratio === null ? 'Unmeasured' : contrastLevel(ratio, pair.kind, pair.minimum)}</td>
              </tr>
            )
          })}
        </tbody>
      </DataTable>
      <DataTable className={styles.data} caption="Colour tokens">
        <thead>
          <tr>
            <th scope="col">Swatch</th>
            <th scope="col">Token</th>
            <th scope="col">Resolved</th>
            <th scope="col">Declared</th>
            <th scope="col">Use</th>
          </tr>
        </thead>
        <tbody>
          {colourTokens.map(({ name, use }) => {
            const resolved = resolvedOf(measurement, name)

            return (
              <tr key={name}>
                <td><Swatch properties={{ '--swatch-colour': `var(${name})` }} /></td>
                <td><code>{name}</code></td>
                <td><code>{resolved?.value === undefined || resolved.value === '' ? 'unmeasured' : resolved.value}</code></td>
                <td><code>{resolved?.declared ?? ''}</code></td>
                <td>{use}</td>
              </tr>
            )
          })}
        </tbody>
      </DataTable>
      <p>
        Hairline rules in <code>--color-border</code> are decorative and exempt from a contrast minimum; inputs and the table header use
        {' '}<code>--color-border-strong</code>, measured above at 3:1. Focus uses the accent, measured above as link text.
      </p>
    </Section>
  )
}

const figures = ['1,111.11', '48,210.55', '9,400.00', '711.17'] as const

function TypeSection({ measurement }: MeasurementProps) {
  return (
    <Section id="type" title="Type">
      <p>
        One system font stack in two weights. Each size is a <code>clamp()</code> between a phone and a wide desktop; the resolved size is
        read from a probe at the current viewport{measurement === null ? '' : `, ${String(measurement.width)} px wide`}.
      </p>
      <DataTable className={styles.data} caption="Text sizes">
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col">Declared</th>
            <th scope="col" className={styles.numeric}>Resolved</th>
            <th scope="col">Sample</th>
          </tr>
        </thead>
        <tbody>
          {textTokens.map(({ name, note }) => {
            const resolved = resolvedOf(measurement, name)

            return (
              <tr key={name}>
                <td><code>{name}</code>{note === undefined ? null : <span className={styles.note}> {note}</span>}</td>
                <td><code>{resolved?.declared ?? ''}</code></td>
                <td className={styles.numeric}>{pixels(resolved?.value)}</td>
                <td>
                  <span className={styles.typeSample} ref={cssProperties({ '--sample-size': `var(${name})` })}>
                    Kessler GmbH paid 8,900.00 EUR
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </DataTable>
      <table className={styles.figures}>
        <caption className={styles.caption}>Tabular figures keep every digit the same width, so amounts line up</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.numeric}>Proportional</th>
            <th scope="col" className={styles.numeric}>Tabular</th>
          </tr>
        </thead>
        <tbody>
          {figures.map((figure) => (
            <tr key={figure}>
              <td className={cx(styles.numeric, styles.proportional)}>{figure}</td>
              <td className={styles.numeric}>{figure}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function SpaceSection({ measurement }: MeasurementProps) {
  return (
    <Section id="space" title="Space">
      <p>A 4 px scale for gaps, padding and control heights.</p>
      <DataTable className={styles.data} caption="Space scale">
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col" className={styles.numeric}>Resolved</th>
            <th scope="col">Length</th>
          </tr>
        </thead>
        <tbody>
          {spaceTokens.map(({ name }) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td className={styles.numeric}>{pixels(resolvedOf(measurement, name)?.value)}</td>
              <td><Swatch className={styles.length} properties={{ '--swatch-length': `var(${name})` }} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Section>
  )
}

function RadiusSection({ measurement }: MeasurementProps) {
  return (
    <Section id="radius" title="Radius">
      <p>Controls keep a small radius, floating layers a larger one. The ledger and page sections have none.</p>
      <DataTable className={styles.data} caption="Radius scale">
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col" className={styles.numeric}>Resolved</th>
            <th scope="col">Use</th>
            <th scope="col">Corner</th>
          </tr>
        </thead>
        <tbody>
          {radiusTokens.map(({ name, note }) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td className={styles.numeric}>{pixels(resolvedOf(measurement, name)?.value)}</td>
              <td>{note}</td>
              <td><Swatch className={styles.corner} properties={{ '--swatch-radius': `var(${name})` }} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Section>
  )
}

function ShadowSection({ measurement }: MeasurementProps) {
  const resolved = resolvedOf(measurement, '--shadow-raised')

  return (
    <Section id="shadow" title="Shadow">
      <p>Only things that float or arrive get a shadow: popovers, dialogs, toasts and the live feed card. Sections never float.</p>
      <div className={styles.shadowRow}>
        <Swatch className={styles.raised} properties={{ '--swatch-shadow': 'var(--shadow-raised)' }} />
        <dl className={styles.facts}>
          <dt><code>--shadow-raised</code></dt>
          <dd><code>{resolved?.value === undefined || resolved.value === '' ? 'unmeasured' : resolved.value}</code></dd>
        </dl>
      </div>
    </Section>
  )
}

function MotionSection({ measurement }: MeasurementProps) {
  return (
    <Section id="motion" title="Motion">
      <p>Motion only answers an action. Nothing animates on load; the skeleton shimmer is the one ambient exception.</p>
      <DataTable className={styles.data} caption="Durations and easing">
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col" className={styles.numeric}>Resolved</th>
            <th scope="col">Use</th>
          </tr>
        </thead>
        <tbody>
          {durationTokens.map(({ name, note }) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td className={styles.numeric}>{milliseconds(resolvedOf(measurement, name)?.value)}</td>
              <td>{note}</td>
            </tr>
          ))}
          <tr>
            <td><code>--ease-out</code></td>
            <td className={styles.numeric}><code>{resolvedOf(measurement, '--ease-out')?.value ?? 'unmeasured'}</code></td>
            <td>Every transition</td>
          </tr>
        </tbody>
      </DataTable>
      <p>
        {measurement?.reducedMotion === true
          ? 'This browser asks for reduced motion, so every duration and delay above measures 0 ms. '
          : 'This browser does not ask for reduced motion. '}
        With reduced motion every duration and delay token resolves to 0 ms: popovers, tooltips and toasts appear without fading, the
        spinner and the skeleton shimmer stop, and the route cross-fade is skipped.
      </p>
    </Section>
  )
}

function LayersSection({ measurement }: MeasurementProps) {
  return (
    <Section id="layers" title="Layers">
      <DataTable className={styles.data} caption="Stacking order">
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col" className={styles.numeric}>Resolved</th>
            <th scope="col">Use</th>
          </tr>
        </thead>
        <tbody>
          {layerTokens.map(({ name, note }) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td className={styles.numeric}>{resolvedOf(measurement, name)?.value ?? 'unmeasured'}</td>
              <td>{note}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <p>
        Menus and tooltips open as popovers and dialogs open with <code>showModal()</code>, so all three render in the browser&apos;s top
        layer above every stacking context and need no z-index. The two tokens cover what does stack in the page: the sticky table
        header, and the toast region together with the skip link.
      </p>
    </Section>
  )
}

export function TokenSections({ measurement }: MeasurementProps) {
  return (
    <>
      <ColourSection measurement={measurement} />
      <TypeSection measurement={measurement} />
      <SpaceSection measurement={measurement} />
      <RadiusSection measurement={measurement} />
      <ShadowSection measurement={measurement} />
      <MotionSection measurement={measurement} />
      <LayersSection measurement={measurement} />
    </>
  )
}
