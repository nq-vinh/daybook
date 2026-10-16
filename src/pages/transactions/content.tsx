import { useId, useRef, useState } from 'react'

import { useRoute } from '../../router/router'
import { useLedgerQuery } from '../../state/query'
import { parseFilter, serializeFilter } from '../../state/url'
import { Button } from '../../ui/Button/Button'
import { EmptyState } from '../../ui/EmptyState/EmptyState'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import styles from '../transactions.module.css'
import { resultView, type LedgerResultView } from './balances'
import { clearedFilter, SELECTION_LIMIT, writeFilter } from './filters'
import { Ledger } from './ledger'
import { SelectionBar } from './selection-bar'
import { FilterSidebar } from './sidebar'
import { Totals } from './totals'

const EMPTY_SELECTION: ReadonlySet<number> = new Set()

const SKELETON_ROWS = 12

export function LedgerContent() {
  const { location } = useRoute()
  const filter = parseFilter(location.search)
  const search = serializeFilter(filter)
  const sidebarSearch = serializeFilter({ ...filter, q: '' })
  const { column: sortColumn, dir: sortDir } = filter.sort
  const { ids, totals, isStale, isReady, search: landedSearch } = useLedgerQuery(filter)
  const resultsHeadingId = useId()
  const resultsHeading = useRef<HTMLHeadingElement>(null)
  const [selection, setSelection] = useState<ReadonlySet<number>>(EMPTY_SELECTION)
  const [selectionSearch, setSelectionSearch] = useState(search)
  const [result, setResult] = useState<LedgerResultView>(() => resultView(ids, landedSearch))

  if (selectionSearch !== search) {
    setSelectionSearch(search)
    setSelection(EMPTY_SELECTION)
  }

  if (result.ids !== ids) {
    setResult(resultView(ids, landedSearch))
  }

  function finishSelection() {
    resultsHeading.current?.focus()
    setSelection(EMPTY_SELECTION)
  }

  const clearAction = (
    <Button
      variant="secondary"
      onClick={() => {
        writeFilter(clearedFilter)
      }}
    >
      Clear filters
    </Button>
  )

  function ledger() {
    if (!isReady) {
      return <Skeleton variant="text" lines={SKELETON_ROWS} />
    }
    if (ids.length === 0) {
      return (
        <EmptyState
          headingLevel={3}
          title="No transactions match these filters."
          description="Clear filters or widen the date range."
          action={clearAction}
        />
      )
    }
    return (
      <Ledger
        ids={result.ids}
        sortColumn={sortColumn}
        sortDir={sortDir}
        balances={result.balances}
        balanceCurrency={result.balanceCurrency}
        selection={selection}
        onSelectionChange={setSelection}
      />
    )
  }

  return (
    <div className={styles.layout}>
      <FilterSidebar search={sidebarSearch} />
      <section className={styles.results} aria-labelledby={resultsHeadingId} aria-busy={isStale}>
        <h2 id={resultsHeadingId} ref={resultsHeading} className="visually-hidden" tabIndex={-1}>Results</h2>
        <Totals totals={totals} isReady={isReady} />
        <div className={styles.selectionSlot}>
          {selection.size > 0 && (
            <SelectionBar
              selection={selection}
              limited={selection.size >= SELECTION_LIMIT && ids.length > SELECTION_LIMIT}
              onDone={finishSelection}
            />
          )}
        </div>
        {ledger()}
      </section>
    </div>
  )
}
