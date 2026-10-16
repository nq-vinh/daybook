import { useId, useRef, useSyncExternalStore } from 'react'

import { ACCOUNTS } from '../../domain/world'
import { type FilterState, parseFilter, STATUSES, type Status } from '../../state/url'
import { Button } from '../../ui/Button/Button'
import { Checkbox } from '../../ui/Checkbox/Checkbox'
import { DateRangeField } from '../../ui/DateRangeField/DateRangeField'
import { NumberField } from '../../ui/NumberField/NumberField'
import styles from '../transactions.module.css'
import {
  activeFilterCount,
  cardsForAccount,
  CATEGORY_GROUPS,
  clearedFilter,
  FIRST_DAY,
  LAST_DAY,
  toggled,
  writeFilter,
} from './filters'

const NARROW_QUERY = '(width < 900px)'

const statusLabels: Record<Status, string> = { booked: 'Booked', pending: 'Pending', declined: 'Declined' }

function subscribeNarrow(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const query = window.matchMedia(NARROW_QUERY)
  query.addEventListener('change', listener)
  return () => {
    query.removeEventListener('change', listener)
  }
}

function getNarrow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches
}

interface AmountFieldProps {
  readonly label: string
  readonly value: number | null
  readonly currency: string
  readonly onCommit: (value: number | null) => void
}

function AmountField({ label, value, currency, onCommit }: AmountFieldProps) {
  const draft = useRef<number | null>(value)

  return (
    <NumberField
      label={label}
      currency={currency}
      defaultValue={value}
      onValueChange={(next) => {
        draft.current = next
      }}
      onBlur={() => {
        if (draft.current !== value) {
          onCommit(draft.current)
        }
      }}
    />
  )
}

function FilterControls({ filter }: { readonly filter: FilterState }) {
  const currency = ACCOUNTS.find((account) => account.id === filter.account)?.currency ?? 'EUR'

  return (
    <div className={styles.controls}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Categories</legend>
        {CATEGORY_GROUPS.map((group) => (
          <fieldset key={group.label} className={styles.subgroup}>
            <legend className={styles.sublegend}>{group.label}</legend>
            {group.categories.map((category) => (
              <Checkbox
                key={category.id}
                label={category.label}
                checked={filter.cat.includes(category.id)}
                onChange={() => {
                  writeFilter((current) => ({ ...current, cat: toggled(current.cat, category.id) }))
                }}
              />
            ))}
          </fieldset>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Cards</legend>
        {cardsForAccount(filter.account).map((card) => (
          <Checkbox
            key={card.id}
            label={`${card.holder}, ending ${card.last4}`}
            checked={filter.card.includes(card.id)}
            onChange={() => {
              writeFilter((current) => ({ ...current, card: toggled(current.card, card.id) }))
            }}
          />
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Status</legend>
        {STATUSES.map((status) => (
          <Checkbox
            key={status}
            label={statusLabels[status]}
            checked={filter.status.includes(status)}
            onChange={() => {
              writeFilter((current) => ({ ...current, status: toggled(current.status, status) }))
            }}
          />
        ))}
      </fieldset>
      <DateRangeField
        className={styles.group}
        legend="Booked between"
        min={FIRST_DAY}
        max={LAST_DAY}
        value={{ from: filter.from, to: filter.to }}
        onValueChange={({ from, to }) => {
          writeFilter((current) => ({ ...current, from, to }))
        }}
      />
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Amount</legend>
        <AmountField
          key={`min-${String(filter.min)}-${currency}`}
          label="Minimum amount"
          currency={currency}
          value={filter.min}
          onCommit={(min) => {
            writeFilter((current) => ({ ...current, min }))
          }}
        />
        <AmountField
          key={`max-${String(filter.max)}-${currency}`}
          label="Maximum amount"
          currency={currency}
          value={filter.max}
          onCommit={(max) => {
            writeFilter((current) => ({ ...current, max }))
          }}
        />
      </fieldset>
      <Button
        variant="quiet"
        className={styles.clear}
        onClick={() => {
          writeFilter(clearedFilter)
        }}
      >
        Clear filters
      </Button>
    </div>
  )
}

export function FilterSidebar({ search }: { readonly search: string }) {
  const filter = parseFilter(search)
  const headingId = useId()
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrow)
  const active = activeFilterCount(filter)

  if (narrow) {
    return (
      <aside className={styles.sidebar} aria-labelledby={headingId}>
        <details className={styles.disclosure}>
          <summary className={styles.summary}>
            <h2 id={headingId} className={styles.sidebarHeading}>Filters</h2>
            {active > 0 && <span className={styles.count}>{` (${String(active)})`}</span>}
          </summary>
          <FilterControls filter={filter} />
        </details>
      </aside>
    )
  }

  return (
    <aside className={styles.sidebar} aria-labelledby={headingId}>
      <div className={styles.sidebarHead}>
        <h2 id={headingId} className={styles.sidebarHeading}>Filters</h2>
        {active > 0 && <span className={styles.count}>{`${String(active)} active`}</span>}
      </div>
      <FilterControls filter={filter} />
    </aside>
  )
}
