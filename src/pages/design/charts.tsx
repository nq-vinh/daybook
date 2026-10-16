import { formatMoney } from '../../domain/format'
import { CashFlowChart } from '../../ui/charts/CashFlowChart'
import { chartMonths, type MonthTotalsAt } from '../../ui/charts/months'
import { Sparkline } from '../../ui/charts/Sparkline'
import { HudPanel } from '../../ui/Hud/Hud'
import { ComponentSection, Section } from './section'

const LOCALE = 'en-GB'

const SAMPLE_NETS = [
  1_840_000, 2_210_000, -640_000, 1_120_000, 2_960_000, 3_310_000, 2_480_000, -1_150_000, 890_000, 1_760_000, 2_430_000, 2_050_000,
] as const

const SAMPLE_MONTHS: readonly MonthTotalsAt[] = [
  ...SAMPLE_NETS.map((net, offset): MonthTotalsAt => ({
    start: Date.UTC(2025, 8 + offset, 1),
    income: 9_000_000 + offset * 120_000,
    expense: 9_000_000 + offset * 120_000 - net,
    net,
    kind: 'complete',
  })),
  { start: Date.UTC(2026, 8, 1), income: 4_200_000, expense: 3_350_000, net: 850_000, kind: 'current' },
  { start: Date.UTC(2026, 9, 1), income: 10_300_000, expense: 8_420_000, net: 1_880_000, kind: 'forecast' },
  { start: Date.UTC(2026, 10, 1), income: 10_100_000, expense: 10_560_000, net: -460_000, kind: 'forecast' },
  { start: Date.UTC(2026, 11, 1), income: 10_600_000, expense: 8_990_000, net: 1_610_000, kind: 'forecast' },
]

const SAMPLE_BALANCE = Array.from({ length: 31 }, (_, day) => 4_820_000 + day * 21_000 + ((day * 7) % 5) * 64_000 - (day % 9 === 0 ? 310_000 : 0))

function sparklineLabel(points: readonly number[]): string {
  return `30-day balance, from ${formatMoney(points[0] ?? 0, 'EUR', LOCALE)} to ${formatMoney(points.at(-1) ?? 0, 'EUR', LOCALE)}`
}

export function ChartSections() {
  return (
    <Section id="charts" title="Charts">
      <p>
        Charts are drawn on a canvas at the device pixel ratio from tokens read at draw time, so they follow the theme. Each one carries a
        text summary, and the cash-flow chart also has a table of the same numbers and a keyboard cursor.
      </p>
      <ComponentSection
        name="CashFlowChart"
        description="Monthly net cash flow as bars above and below a neutral baseline, with the forecast months hatched over a shaded band."
        keyboard={[
          'Tab focuses the chart and places the cursor on the current month.',
          'Arrow Left and Arrow Right move the cursor one month; Home and End jump to the first and last month.',
          'Each move announces the month, net, income and expense once.',
        ]}
        hover="Hovering a month shows the same tooltip and a crosshair."
      >
        <CashFlowChart months={chartMonths(SAMPLE_MONTHS, LOCALE)} currency="EUR" locale={LOCALE} />
      </ComponentSection>
      <ComponentSection
        name="Sparkline"
        description="A 30-day balance in ink with a dot at the last point. No axes and no fill; the label carries the first and last value."
        keyboard={['Not focusable: the tile it sits in carries the numbers as text.']}
      >
        <Sparkline points={SAMPLE_BALANCE} label={sparklineLabel(SAMPLE_BALANCE)} />
      </ComponentSection>
    </Section>
  )
}

export function HudSection() {
  return (
    <ComponentSection
      name="Hud"
      description="The performance panel toggled from the header. It observes interactions, long tasks, the DOM size and the chart draw rate only while open."
      keyboard={['The header Performance button toggles the panel and reports its state with aria-pressed.']}
    >
      <HudPanel
        label="Performance example"
        placement="inline"
        locale={LOCALE}
        metrics={{ worstInteraction: 24, longTaskCount: 2, longTaskTotal: 131, domNodes: 1_482, drawRate: 60, supported: { event: true, longtask: true } }}
      />
    </ComponentSection>
  )
}
