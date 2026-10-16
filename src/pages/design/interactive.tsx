import { useState } from 'react'

import { formatDate, formatMoney } from '../../domain/format'
import { RECURRING_COUNT, TRANSACTION_COUNT, transaction, type TransactionStatus } from '../../domain/transactions'
import { COUNTERPARTIES } from '../../domain/world'
import { toast } from '../../state/toast'
import { Badge, type BadgeTone } from '../../ui/Badge/Badge'
import { Button } from '../../ui/Button/Button'
import { Dialog } from '../../ui/Dialog/Dialog'
import { Icon, type IconName } from '../../ui/Icon/Icon'
import { IconButton } from '../../ui/IconButton/IconButton'
import { Menu, type MenuEntry } from '../../ui/Menu/Menu'
import { Table, type TableColumn, type TableSort } from '../../ui/Table/Table'
import { Tabs } from '../../ui/Tabs/Tabs'
import { Tooltip } from '../../ui/Tooltip/Tooltip'
import styles from './design.module.css'
import { ComponentSection, forceFocusOn, ScrollRegion, States } from './section'

const LEDGER_SAMPLE_SIZE = 6
const LEDGER_SAMPLE_STEP = 997

interface LedgerRow {
  readonly key: string
  readonly bookedAt: number
  readonly counterparty: string
  readonly status: TransactionStatus
  readonly amount: number
}

const statusBadges: Record<TransactionStatus, { readonly tone: BadgeTone; readonly label: string }> = {
  booked: { tone: 'neutral', label: 'Booked' },
  pending: { tone: 'warning', label: 'Pending' },
  declined: { tone: 'negative', label: 'Declined' },
}

function sampleLedger(): readonly LedgerRow[] {
  const rows: LedgerRow[] = []

  for (let id = RECURRING_COUNT; id < TRANSACTION_COUNT && rows.length < LEDGER_SAMPLE_SIZE; id += LEDGER_SAMPLE_STEP) {
    const entry = transaction(id)

    if (entry.currency === 'EUR') {
      rows.push({
        key: String(entry.id),
        bookedAt: entry.bookedAt,
        counterparty: COUNTERPARTIES.find(({ id: counterpartyId }) => counterpartyId === entry.counterpartyId)?.name ?? entry.counterpartyId,
        status: entry.status,
        amount: entry.amount,
      })
    }
  }

  return rows
}

const ledgerRows = sampleLedger()

const ledgerColumns: readonly TableColumn<LedgerRow>[] = [
  { key: 'date', header: 'Date', cell: (row) => formatDate(row.bookedAt), sortable: true, width: 'md' },
  { key: 'counterparty', header: 'Counterparty', cell: (row) => row.counterparty, width: 'lg' },
  { key: 'status', header: 'Status', cell: (row) => <Badge tone={statusBadges[row.status].tone}>{statusBadges[row.status].label}</Badge>, width: 'sm' },
  { key: 'amount', header: 'Amount', cell: (row) => formatMoney(row.amount, 'EUR'), numeric: true, align: 'end', sortable: true, width: 'md' },
]

function sortLedger(rows: readonly LedgerRow[], sort: TableSort | null): readonly LedgerRow[] {
  if (sort === null) {
    return rows
  }

  const direction = sort.direction === 'ascending' ? 1 : -1
  return [...rows].sort((first, second) => direction * (sort.key === 'amount' ? first.amount - second.amount : first.bookedAt - second.bookedAt))
}

const iconNames = [
  'chevron-down',
  'check',
  'check-circle',
  'alert',
  'info',
  'sun',
  'moon',
  'monitor',
  'spinner',
  'close',
  'more-horizontal',
  'arrow-up',
  'arrow-down',
] as const satisfies readonly IconName[]

function MenuSection() {
  const [chosen, setChosen] = useState('Nothing yet')
  const choose = (label: string) => () => {
    setChosen(label)
  }
  const items: readonly MenuEntry[] = [
    { id: 'categorise', label: 'Categorise', onSelect: choose('Categorise') },
    { id: 'export', label: 'Export as CSV', onSelect: choose('Export as CSV') },
    { id: 'duplicate', label: 'Duplicate', onSelect: choose('Duplicate') },
    { kind: 'separator', id: 'separator' },
    { id: 'delete', label: 'Delete', disabled: true, onSelect: choose('Delete') },
  ]

  return (
    <ComponentSection
      name="Menu"
      description="A list of actions in a popover opened by a button. Escape and outside clicks come from the platform; disabled items stay visible and are skipped."
      hover="Hover gives an item the sunken surface, the same as keyboard focus."
      keyboard={[
        'Enter or a click on the button opens the menu and focuses the first item.',
        'Arrow Down on the button opens it on the first item, Arrow Up on the last.',
        'Up and Down move between items and wrap, skipping disabled ones. Home and End jump to the first and last item.',
        'Typing a letter jumps to the next item that starts with it.',
        'Enter or Space chooses the item, closes the menu and returns focus to the button.',
        'Escape closes the menu and returns focus to the button.',
      ]}
    >
      <States
        items={[
          { label: 'With text', content: <Menu label="Actions" items={items} /> },
          { label: 'Icon only', content: <Menu label="More actions" icon="more-horizontal" iconOnly variant="quiet" items={items} /> },
          { label: 'Focus visible', content: <div ref={forceFocusOn('button')}><Menu label="Actions" items={items} /></div> },
        ]}
      />
      <p>Last chosen: <output>{chosen}</output></p>
    </ComponentSection>
  )
}

function TooltipSection() {
  return (
    <ComponentSection
      name="Tooltip"
      description="A short description of its trigger, shown on hover and focus. It never holds anything interactive."
      keyboard={[
        'Focus on the trigger shows the tooltip and blur hides it.',
        'Escape hides it while the trigger is focused or hovered.',
        'The tooltip describes its trigger and is never focusable itself.',
      ]}
    >
      <States
        items={[
          {
            label: 'Default',
            content: (
              <Tooltip content="Booked balance leaves out pending card payments.">
                {(trigger) => (
                  <IconButton label="About the booked balance" {...trigger}>
                    <Icon name="info" />
                  </IconButton>
                )}
              </Tooltip>
            ),
          },
          {
            label: 'Focus visible',
            content: (
              <Tooltip content="Available balance adds the agreed overdraft.">
                {(trigger) => (
                  <IconButton label="About the available balance" data-force-focus="" {...trigger}>
                    <Icon name="info" />
                  </IconButton>
                )}
              </Tooltip>
            ),
          },
        ]}
      />
    </ComponentSection>
  )
}

function DialogSection() {
  const [open, setOpen] = useState(false)
  const close = () => {
    setOpen(false)
  }
  const openDialog = () => {
    setOpen(true)
  }

  return (
    <ComponentSection
      name="Dialog"
      description="A modal question with its answers. The page behind it is inert while it is open."
      keyboard={[
        'It opens modally, named by its title and described by its description.',
        'Escape asks to close it, and focus returns to the button that opened it.',
      ]}
    >
      <States
        items={[
          { label: 'Default', content: <Button variant="danger" onClick={openDialog}>Delete rule</Button> },
          { label: 'Focus visible', content: <Button variant="danger" data-force-focus="" onClick={openDialog}>Delete rule</Button> },
        ]}
      />
      <Dialog
        open={open}
        onClose={close}
        title="Delete this rule?"
        description="Transactions keep their category. New ones are no longer categorised by this rule."
        actions={(
          <>
            <Button variant="quiet" onClick={close}>Keep rule</Button>
            <Button variant="danger" onClick={close}>Delete rule</Button>
          </>
        )}
      />
    </ComponentSection>
  )
}

const tabItems = [
  { id: 'balances', label: 'Balances', content: <p>Booked and available balances for each account.</p> },
  { id: 'activity', label: 'Activity', content: <p>The latest bookings, newest first.</p> },
  { id: 'statements', label: 'Statements', content: <p>Monthly statements as PDF, from October 2023.</p> },
  { id: 'exports', label: 'Exports', content: <p>Scheduled exports.</p>, disabled: true },
] as const

function TabsSection() {
  return (
    <ComponentSection
      name="Tabs"
      description="Switches between views of the same subject. A tab is selected as soon as it gets focus; a disabled tab stays visible and is skipped."
      hover="Hover darkens a tab's text from muted to ink."
      keyboard={[
        'Tab moves to the selected tab.',
        'Left and Right select the previous or next tab at once and wrap. Home and End select the first and last.',
        'The next Tab moves into the panel, which takes focus itself only when nothing inside it can.',
        'Arrows skip a disabled tab, and it is never selected.',
      ]}
    >
      <States
        stacked
        items={[
          { label: 'With a disabled tab', content: <Tabs label="Account views" items={tabItems} /> },
          {
            label: 'Focus visible',
            content: <div ref={forceFocusOn('[role="tab"][aria-selected="true"]')}><Tabs label="Account views, focus shown" items={tabItems} /></div>,
          },
        ]}
      />
    </ComponentSection>
  )
}

function ToastSection() {
  const [archived, setArchived] = useState(0)

  return (
    <ComponentSection
      name="Toast"
      description="Confirms an action that already happened and offers to undo it. Toasts stack at the corner, three at most, and leave on their own after six seconds."
      keyboard={[
        'A toast is announced in the polite Notifications region and does not take focus.',
        'Tab reaches its action and its dismiss button. Enter on Undo runs it and dismisses the toast.',
        'After a dismiss, focus moves to the dismiss button of the toast that takes its place.',
        'Timers pause while the pointer or focus is inside the region.',
      ]}
    >
      <Button
        variant="secondary"
        onClick={() => {
          setArchived((count) => count + 3)
          toast({
            title: 'Archived 3 transactions',
            action: {
              label: 'Undo',
              onAction: () => {
                setArchived((count) => Math.max(0, count - 3))
                toast({ title: 'Restored 3 transactions' })
              },
            },
          })
        }}
      >
        Archive 3 transactions
      </Button>
      <p>Archived in this demo: <output>{archived}</output></p>
    </ComponentSection>
  )
}

interface LedgerDemoProps {
  readonly caption: string
  readonly initialSort: TableSort
  readonly initialSelected: readonly number[]
  readonly forceFocus?: boolean | undefined
}

function LedgerDemo({ caption, initialSort, initialSelected, forceFocus = false }: LedgerDemoProps) {
  const [sort, setSort] = useState<TableSort | null>(initialSort)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(
    initialSelected.flatMap((index) => {
      const row = ledgerRows[index]
      return row === undefined ? [] : [row.key]
    }),
  ))

  return (
    <ScrollRegion label={caption}>
      <div ref={forceFocus ? forceFocusOn('tbody tr') : undefined}>
        <Table
          caption={caption}
          columns={ledgerColumns}
          rows={sortLedger(ledgerRows, sort)}
          getRowKey={(row) => row.key}
          getRowLabel={(row) => `${row.counterparty} ${formatMoney(row.amount, 'EUR')}`}
          sort={sort}
          onSortChange={setSort}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowFocus
        />
      </div>
    </ScrollRegion>
  )
}

function TableSection() {
  return (
    <ComponentSection
      name="Table"
      description="The ledger. Rows are separated by hairlines, the header rule is strong, figures are tabular and right aligned. Selection uses a sunken row with an accent edge, and a Highlight edge under forced colours."
      hover="Rows do not change on hover. A sort button's label darkens from muted to ink."
      keyboard={[
        'Tab reaches the select all checkbox and the sort buttons, then the rows as one stop.',
        'Up and Down move between rows, Home and End jump to the first and last, Page Up and Page Down move by ten.',
        'Space selects or clears the focused row.',
        'Enter on a sort button sorts by that column, and again flips the direction.',
        'Select all is mixed while only some rows are selected.',
      ]}
    >
      <LedgerDemo
        caption="Ledger sample"
        initialSort={{ key: 'date', direction: 'descending' }}
        initialSelected={[0]}
      />
      <LedgerDemo
        caption="Ledger sample sorted by amount, focus shown on one row"
        initialSort={{ key: 'amount', direction: 'ascending' }}
        initialSelected={[1, 3]}
        forceFocus
      />
    </ComponentSection>
  )
}

function IconSection() {
  return (
    <ComponentSection
      name="Icon"
      description="Inline SVG on a 16 or 20 pixel grid in the current text colour. Decorative by default; a label makes it a named image."
      keyboard={['Not focusable. Hidden from assistive technology unless it has a label, then read as an image.']}
    >
      <ul className={styles.icons}>
        {iconNames.map((name) => (
          <li key={name} className={styles.icon}>
            <Icon name={name} />
            <Icon name={name} size={20} />
            <span>{name}</span>
          </li>
        ))}
      </ul>
      <p className={styles.icon}>
        <Icon name="alert" label="Warning" /> A labelled icon is read as its label.
      </p>
    </ComponentSection>
  )
}

export function InteractiveSections() {
  return (
    <>
      <MenuSection />
      <TooltipSection />
      <DialogSection />
      <TabsSection />
      <ToastSection />
      <TableSection />
      <IconSection />
    </>
  )
}
