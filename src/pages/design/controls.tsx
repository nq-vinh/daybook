import { formatMoney } from '../../domain/format'
import { COUNTERPARTIES, TODAY, WINDOW_START, type Counterparty } from '../../domain/world'
import { Avatar, avatarHue } from '../../ui/Avatar/Avatar'
import { Badge, type BadgeTone } from '../../ui/Badge/Badge'
import { Button, type ButtonVariant } from '../../ui/Button/Button'
import { Checkbox } from '../../ui/Checkbox/Checkbox'
import { DateRangeField } from '../../ui/DateRangeField/DateRangeField'
import { EmptyState } from '../../ui/EmptyState/EmptyState'
import { Icon } from '../../ui/Icon/Icon'
import { IconButton } from '../../ui/IconButton/IconButton'
import { NumberField } from '../../ui/NumberField/NumberField'
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar'
import { Select } from '../../ui/Select/Select'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { StatTile } from '../../ui/StatTile/StatTile'
import { Switch } from '../../ui/Switch/Switch'
import { TextField } from '../../ui/TextField/TextField'
import { ThemeSwitch } from '../../ui/ThemeSwitch/ThemeSwitch'
import styles from './design.module.css'
import { ComponentSection, DataTable, States } from './section'

const buttonVariants = [
  { variant: 'primary', name: 'Primary', label: 'Save budget' },
  { variant: 'secondary', name: 'Secondary', label: 'Export' },
  { variant: 'quiet', name: 'Quiet', label: 'Cancel' },
  { variant: 'danger', name: 'Danger', label: 'Delete rule' },
] as const satisfies readonly { variant: ButtonVariant; name: string; label: string }[]

const badgeTones = [
  { tone: 'neutral', label: 'Booked' },
  { tone: 'positive', label: 'Paid' },
  { tone: 'negative', label: 'Declined' },
  { tone: 'warning', label: 'Pending' },
  { tone: 'accent', label: 'New' },
] as const satisfies readonly { tone: BadgeTone; label: string }[]

const avatarSamples: readonly Counterparty[] = [...COUNTERPARTIES.reduce((byHue, counterparty) => {
  const hue = avatarHue(counterparty.id)
  return byHue.has(hue) ? byHue : byHue.set(hue, counterparty)
}, new Map<number, Counterparty>()).entries()]
  .sort(([first], [second]) => first - second)
  .map(([, counterparty]) => counterparty)

const namedAvatar = COUNTERPARTIES.find(({ kind }) => kind === 'customer') ?? COUNTERPARTIES[0]

const isoDate = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10)
const windowStart = isoDate(WINDOW_START)
const today = isoDate(TODAY)
const monthStart = `${today.slice(0, 8)}01`

const accountOptions = (
  <>
    <option value="main">Main EUR</option>
    <option value="operating">Operating USD</option>
    <option value="payroll">Payroll EUR</option>
  </>
)

function ButtonSection() {
  return (
    <ComponentSection
      name="Button"
      description="Names the result of the action. Four variants in two sizes. Loading keeps the width and the accessible name."
      hover="Hover darkens primary and danger fills by one step and gives secondary and quiet buttons the sunken surface."
      keyboard={[
        'Tab moves to the button. Enter and Space activate it.',
        'While loading it stays focusable but does nothing and does not submit its form.',
        'A disabled button is skipped by Tab.',
      ]}
    >
      <DataTable className={styles.matrix} caption="Button variants by state" hideCaption>
        <thead>
          <tr>
            <th scope="col">Variant</th>
            <th scope="col">Default</th>
            <th scope="col">Small</th>
            <th scope="col">Focus visible</th>
            <th scope="col">Disabled</th>
            <th scope="col">Loading</th>
          </tr>
        </thead>
        <tbody>
          {buttonVariants.map(({ variant, name, label }) => (
            <tr key={variant}>
              <th scope="row">{name}</th>
              <td><Button variant={variant}>{label}</Button></td>
              <td><Button variant={variant} size="sm">{label}</Button></td>
              <td><Button variant={variant} data-force-focus="">{label}</Button></td>
              <td><Button variant={variant} disabled>{label}</Button></td>
              <td><Button variant={variant} loading>{label}</Button></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </ComponentSection>
  )
}

function IconButtonSection() {
  const icon = <Icon name="more-horizontal" />

  return (
    <ComponentSection
      name="IconButton"
      description="A button whose only content is an icon. The label is its accessible name; the icon is hidden from assistive technology."
      hover="Hover gives the button the sunken surface."
      keyboard={[
        'Tab moves to the button. Enter and Space activate it.',
        'A toggle button reports its state as pressed.',
      ]}
    >
      <States
        items={[
          { label: 'Default', content: <IconButton label="More actions">{icon}</IconButton> },
          { label: 'Secondary', content: <IconButton label="More actions" variant="secondary">{icon}</IconButton> },
          { label: 'Focus visible', content: <IconButton label="More actions" data-force-focus="">{icon}</IconButton> },
          { label: 'Pressed', content: <IconButton label="Pin account" pressed><Icon name="check" /></IconButton> },
          { label: 'Disabled', content: <IconButton label="More actions" disabled>{icon}</IconButton> },
          { label: 'Loading', content: <IconButton label="More actions" loading>{icon}</IconButton> },
        ]}
      />
    </ComponentSection>
  )
}

function TextFieldSection() {
  return (
    <ComponentSection
      name="TextField"
      description="A labelled input with an optional description, error, prefix and suffix. The description and error are read with the input."
      keyboard={[
        'Tab moves to the input and typing edits it.',
        'Controls in the prefix or suffix keep their place in the Tab order.',
      ]}
    >
      <States
        items={[
          { label: 'Default', content: <TextField label="Reference" defaultValue="Invoice 2026-118" /> },
          { label: 'With description', content: <TextField label="Note" description="Only you can see notes." /> },
          { label: 'Focus visible', content: <TextField label="Reference" defaultValue="Invoice 2026-118" data-force-focus="" /> },
          { label: 'Disabled', content: <TextField label="Reference" defaultValue="Invoice 2026-118" disabled /> },
          { label: 'Error', content: <TextField label="Reference" defaultValue="?" error="Use letters, digits and dashes only." /> },
          { label: 'Prefix and suffix', content: <TextField label="VAT rate" defaultValue="19" align="end" prefix="DE" suffix="%" /> },
        ]}
      />
    </ComponentSection>
  )
}

function NumberFieldSection() {
  return (
    <ComponentSection
      name="NumberField"
      description="A money input that stores integer minor units. It reads the locale's separators, checks the draft as you type and formats it with the currency once you leave."
      keyboard={[
        'Tab moves to the field and selects the editable amount.',
        'Typing is checked as you go without interrupting; leaving the field formats a valid amount or says how to fix it.',
      ]}
    >
      <States
        items={[
          { label: 'Default', content: <NumberField label="Budget" currency="EUR" locale="en-GB" defaultValue={125_000} /> },
          { label: 'Empty', content: <NumberField label="Budget" currency="EUR" locale="en-GB" description="Monthly limit in euros." /> },
          { label: 'Focus visible', content: <NumberField label="Budget" currency="EUR" locale="en-GB" defaultValue={125_000} data-force-focus="" /> },
          { label: 'Disabled', content: <NumberField label="Budget" currency="EUR" locale="en-GB" defaultValue={125_000} disabled /> },
          {
            label: 'Error',
            content: <NumberField label="Budget" currency="EUR" locale="en-GB" defaultValue={2_500_000} error="Keep the budget at or below 10,000.00 EUR." />,
          },
        ]}
      />
    </ComponentSection>
  )
}

function SelectSection() {
  return (
    <ComponentSection
      name="Select"
      description="A native select with a visible label, description and error."
      keyboard={[
        'Tab moves to the select.',
        'The option list is the browser\'s own and answers to its own keys.',
      ]}
    >
      <States
        items={[
          { label: 'Default', content: <Select label="Account" defaultValue="main">{accountOptions}</Select> },
          { label: 'Focus visible', content: <Select label="Account" defaultValue="main" data-force-focus="">{accountOptions}</Select> },
          { label: 'Disabled', content: <Select label="Account" defaultValue="main" disabled>{accountOptions}</Select> },
          {
            label: 'Error',
            content: <Select label="Account" defaultValue="operating" error="Choose a EUR account for SEPA transfers.">{accountOptions}</Select>,
          },
        ]}
      />
    </ComponentSection>
  )
}

function CheckboxSection() {
  return (
    <ComponentSection
      name="Checkbox"
      description="A native checkbox drawn as a box, named by its visible or visually hidden label. Indeterminate is set through the DOM property."
      hover="Hover changes nothing. The box and the label are one click target."
      keyboard={[
        'Tab moves to the checkbox. Space toggles it, and so does a click on the label.',
        'A disabled checkbox cannot be toggled.',
      ]}
    >
      <States
        items={[
          { label: 'Unchecked', content: <Checkbox label="Include pending" /> },
          { label: 'Checked', content: <Checkbox label="Include pending" defaultChecked /> },
          { label: 'Indeterminate', content: <Checkbox label="Select all rows" indeterminate /> },
          { label: 'Focus visible', content: <Checkbox label="Include pending" data-force-focus="" /> },
          { label: 'Disabled', content: <Checkbox label="Include pending" disabled /> },
          { label: 'Disabled and checked', content: <Checkbox label="Include pending" defaultChecked disabled /> },
        ]}
      />
    </ComponentSection>
  )
}

function SwitchSection() {
  return (
    <ComponentSection
      name="Switch"
      description="An on or off setting that applies at once. It is a native checkbox with switch semantics."
      hover="Hover changes nothing. The track and the label are one click target."
      keyboard={['Tab moves to the switch. Space toggles it. Enter does nothing.']}
    >
      <States
        items={[
          { label: 'Off', content: <Switch label="Freeze card" /> },
          { label: 'On', content: <Switch label="Freeze card" defaultChecked /> },
          { label: 'Focus visible', content: <Switch label="Freeze card" data-force-focus="" /> },
          { label: 'Disabled', content: <Switch label="Freeze card" disabled /> },
        ]}
      />
    </ComponentSection>
  )
}

function DateRangeFieldSection() {
  return (
    <ComponentSection
      name="DateRangeField"
      description="Two native date inputs grouped under a legend, limited to the seeded world's window. An end date before the start date is flagged in words."
      keyboard={[
        'Tab moves from the start date to the end date.',
        'An end date before the start date shows an error that clears once the range is fixed.',
      ]}
    >
      <States
        items={[
          {
            label: 'Default',
            content: <DateRangeField legend="Booked between" min={windowStart} max={today} defaultValue={{ from: monthStart, to: today }} />,
          },
          {
            label: 'End before start',
            content: <DateRangeField legend="Booked between" min={windowStart} max={today} defaultValue={{ from: today, to: monthStart }} />,
          },
          {
            label: 'Disabled',
            content: <DateRangeField legend="Booked between" min={windowStart} max={today} defaultValue={{ from: monthStart, to: today }} disabled />,
          },
        ]}
      />
    </ComponentSection>
  )
}

function ThemeSwitchSection() {
  return (
    <ComponentSection
      name="ThemeSwitch"
      description="Chooses system, light or dark. The choice is stored and applied to the whole app, so switching here measures the colours above again. This is the same control as in the header."
      hover="Hover darkens an option's text from muted to ink."
      keyboard={[
        'The group is one Tab stop that lands on the checked option.',
        'Left and Right arrows move the selection and apply it at once.',
      ]}
    >
      <ThemeSwitch />
    </ComponentSection>
  )
}

function BadgeSection() {
  return (
    <ComponentSection
      name="Badge"
      description="A short status word on a tinted surface. The word carries the meaning; the tone repeats it."
      keyboard={['Not focusable. It is read as plain text.']}
    >
      <States items={badgeTones.map(({ tone, label }) => ({ label: tone.charAt(0).toUpperCase() + tone.slice(1), content: <Badge tone={tone}>{label}</Badge> }))} />
    </ComponentSection>
  )
}

function StatTileSection() {
  return (
    <ComponentSection
      name="StatTile"
      description="A rule, a label and a large number. The delta is stated in words with its sign, and an icon repeats the direction."
      keyboard={['Not focusable. It is read as a group named by its label.']}
    >
      <States
        items={[
          {
            label: 'Rising',
            content: <StatTile label="Main EUR" value={formatMoney(4_821_055, 'EUR')} delta={{ value: '+4.2 %', label: 'vs last month', trend: 'up', tone: 'positive' }} />,
          },
          {
            label: 'Falling',
            content: <StatTile label="Operating USD" value={formatMoney(1_209_010, 'USD')} delta={{ value: '-2.4 %', label: 'vs last month', trend: 'down', tone: 'negative' }} />,
          },
          {
            label: 'Flat',
            content: <StatTile label="Payroll EUR" value={formatMoney(940_000, 'EUR')} delta={{ value: '0.0 %', label: 'vs last month', trend: 'flat' }} />,
          },
          { label: 'Without delta', content: <StatTile label="Card spend" value={formatMoney(312_480, 'EUR')} /> },
        ]}
      />
    </ComponentSection>
  )
}

function ProgressBarSection() {
  const of = (spent: number) => `${formatMoney(spent, 'EUR')} of ${formatMoney(100_000, 'EUR')}`

  return (
    <ComponentSection
      name="ProgressBar"
      description="A meter for budget use. The warning threshold comes from high, so what is read out and what is drawn agree."
      keyboard={['Not focusable. It is read as a meter with its value text.']}
    >
      <States
        items={[
          { label: 'Normal', content: <ProgressBar label="Software" value={0.42} high={0.8} valueText={of(42_000)} /> },
          { label: 'Warning', content: <ProgressBar label="Travel" value={0.86} high={0.8} valueText={of(86_000)} /> },
          { label: 'Over', content: <ProgressBar label="Marketing" value={1.12} high={0.8} valueText={of(112_000)} /> },
        ]}
      />
    </ComponentSection>
  )
}

function SkeletonSection() {
  return (
    <ComponentSection
      name="Skeleton"
      description="A placeholder while data is pending. The shimmer stops under reduced motion."
      keyboard={['Not focusable and hidden from assistive technology.']}
    >
      <States
        items={[
          { label: 'Block', content: <Skeleton className={styles.skeletonBlock} /> },
          { label: 'Three text lines', content: <Skeleton variant="text" lines={3} className={styles.skeletonText} /> },
        ]}
      />
    </ComponentSection>
  )
}

function EmptyStateSection() {
  return (
    <ComponentSection
      name="EmptyState"
      description="Says what is missing and what to do next. Its heading level follows the page outline."
      keyboard={['Not focusable itself. Tab reaches the action when there is one.']}
    >
      <EmptyState
        headingLevel={4}
        title="No transactions match these filters"
        description="Clear filters or widen the date range."
        action={<Button variant="secondary">Clear filters</Button>}
      />
    </ComponentSection>
  )
}

function AvatarSection() {
  return (
    <ComponentSection
      name="Avatar"
      description="Initials on one of eight hues picked from the id, so a counterparty keeps its colour everywhere."
      keyboard={['Not focusable. It is read as an image named by the full name, or hidden when the name is already next to it.']}
    >
      <States
        items={[
          { label: 'Named image', content: <Avatar id={namedAvatar.id} name={namedAvatar.name} /> },
          { label: 'Small, named image', content: <Avatar id={namedAvatar.id} name={namedAvatar.name} size="sm" /> },
        ]}
      />
      <p>Next to a visible name the avatar is hidden from assistive technology, one per hue:</p>
      <ul className={styles.avatars}>
        {avatarSamples.map(({ id, name }) => (
          <li key={id} className={styles.avatar}>
            <Avatar id={id} name={name} decorative />
            <Avatar id={id} name={name} size="sm" decorative />
            <span>{name}</span>
          </li>
        ))}
      </ul>
    </ComponentSection>
  )
}

export function ControlSections() {
  return (
    <>
      <ButtonSection />
      <IconButtonSection />
      <TextFieldSection />
      <NumberFieldSection />
      <SelectSection />
      <CheckboxSection />
      <SwitchSection />
      <DateRangeFieldSection />
      <ThemeSwitchSection />
      <BadgeSection />
      <StatTileSection />
      <ProgressBarSection />
      <SkeletonSection />
      <EmptyStateSection />
      <AvatarSection />
    </>
  )
}
