import { useState } from 'react'

import { CATEGORIES, type CategoryId } from '../../domain/world'
import { setCategories } from '../../state/edits'
import { toast } from '../../state/toast'
import { Button } from '../../ui/Button/Button'
import { Select } from '../../ui/Select/Select'
import styles from '../transactions.module.css'
import { CATEGORY_GROUPS, formatCount, SELECTION_LIMIT } from './filters'

export interface SelectionBarProps {
  readonly selection: ReadonlySet<number>
  readonly limited: boolean
  readonly onDone: () => void
}

function isCategoryId(value: string): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value)
}

export function SelectionBar({ selection, limited, onDone }: SelectionBarProps) {
  const [category, setChoice] = useState<CategoryId | null>(null)
  const count = formatCount(selection.size)
  const noun = selection.size === 1 ? 'transaction' : 'transactions'

  function categorise() {
    if (category === null) {
      return
    }
    const label = CATEGORIES.find((candidate) => candidate.id === category)?.label ?? category
    onDone()
    setCategories(selection, category)
    toast({ title: `Categorised ${count} ${noun} as ${label}` })
  }

  return (
    <section className={styles.selection} aria-label="Selection">
      <div className={styles.selectionStatus}>
        <p className={styles.selectionCount}>{count} selected</p>
        {limited && <p className={styles.notice}>{`Selection limited to the first ${formatCount(SELECTION_LIMIT)} rows`}</p>}
      </div>
      <div className={styles.selectionActions}>
        <Select
          label="Category"
          className={styles.inlineField}
          value={category ?? ''}
          onChange={(event) => {
            const { value } = event.target
            setChoice(isCategoryId(value) ? value : null)
          }}
        >
          <option value="" disabled>Choose a category</option>
          {CATEGORY_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </optgroup>
          ))}
        </Select>
        <Button disabled={category === null} onClick={categorise}>{`Categorise ${count} ${noun}`}</Button>
      </div>
    </section>
  )
}
