import { useEffect, useEffectEvent } from 'react'

import { useRoute } from '../../router/router'
import { ChartSections, HudSection } from './charts'
import { ControlSections } from './controls'
import styles from './design.module.css'
import { InteractiveSections } from './interactive'
import { Section } from './section'
import { TokenSections, useTokenMeasurement } from './tokens'

const sections = [
  { id: 'colour', title: 'Colour' },
  { id: 'type', title: 'Type' },
  { id: 'space', title: 'Space' },
  { id: 'radius', title: 'Radius' },
  { id: 'shadow', title: 'Shadow' },
  { id: 'motion', title: 'Motion' },
  { id: 'layers', title: 'Layers' },
  { id: 'components', title: 'Components' },
  { id: 'charts', title: 'Charts' },
] as const

export function DesignContent() {
  const { measurement, probe } = useTokenMeasurement()
  const { location } = useRoute()
  const scrollToFragment = useEffectEvent(() => {
    const fragment = location.fragment ?? window.location.hash.slice(1)

    if (fragment !== '') {
      document.getElementById(fragment)?.scrollIntoView()
    }
  })

  useEffect(() => {
    scrollToFragment()
  }, [])

  return (
    <>
      <nav className={styles.toc} aria-label="Sections">
        <ul className={styles.tocList}>
          {sections.map(({ id, title }) => (
            <li key={id}><a href={`#${id}`}>{title}</a></li>
          ))}
        </ul>
      </nav>
      {probe}
      <TokenSections measurement={measurement} />
      <Section id="components" title="Components">
        <p>
          Every component below is the production one, shown in the states it owns. Hover is described, not simulated. Focus visible is forced
          with a <code>data-force-focus</code> attribute that the shared focus rule also matches, so the ring shown is the real ring. Each
          keyboard sentence restates what the component&apos;s tests check.
        </p>
        <ControlSections />
        <InteractiveSections />
        <HudSection />
      </Section>
      <ChartSections />
    </>
  )
}
