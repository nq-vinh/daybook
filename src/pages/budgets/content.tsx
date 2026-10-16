import { useEffect, useId, useState } from 'react'

import { formatCount, formatMoney, formatPercent } from '../../domain/format'
import { BUDGETS, CATEGORIES } from '../../domain/world'
import { useFeedEvents } from '../../state/feed'
import { useEffectiveBudget, useEffectiveBudgets } from '../../state/optimistic'
import { Badge } from '../../ui/Badge/Badge'
import { NumberField } from '../../ui/NumberField/NumberField'
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import { StatTile } from '../../ui/StatTile/StatTile'
import { type LedgerClient, ledgerClient } from '../../worker/client'
import type { BudgetSpend } from '../../worker/protocol'
import styles from './budgets.module.css'
import { type BudgetCategory, saveBudgetWithUndo } from './save'

const WARNING_RATIO = 0.8

const BUDGET_CATEGORIES: readonly BudgetCategory[] = BUDGETS.map(({ categoryId }) => ({
  id: categoryId,
  label: CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId,
}))

export function budgetMeter(spend: number, budget: number): { readonly value: number; readonly max: number; readonly high: number } {
  if (budget <= 0) {
    return { value: spend > 0 ? 1 : 0, max: 1, high: WARNING_RATIO }
  }
  return { value: Math.min(Math.max(spend, 0), budget), max: budget, high: budget * WARNING_RATIO }
}

export function budgetValueText(spend: number, budget: number): string {
  const amounts = `${formatMoney(spend, 'EUR')} of ${formatMoney(budget, 'EUR')}`
  return budget > 0 ? `${amounts} (${formatPercent(spend / budget, undefined, 0)})` : amounts
}

function BudgetRow({ category, spend }: { readonly category: BudgetCategory; readonly spend: BudgetSpend | undefined }) {
  const budget = useEffectiveBudget(category.id)
  const [draft, setDraft] = useState<number | null | undefined>(undefined)
  const labelId = useId()

  function save() {
    if (draft !== undefined && draft !== null && draft !== budget) {
      saveBudgetWithUndo(category, draft)
    }
    setDraft(undefined)
  }

  return (
    <li className={styles.row}>
      <h2 className={styles.label} id={labelId}>{category.label}</h2>
      <NumberField
        className={styles.field}
        label={`${category.label} budget`}
        currency="EUR"
        value={budget}
        onValueChange={setDraft}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            save()
          }
        }}
      />
      <div className={styles.progress}>
        {spend === undefined
          ? <Skeleton variant="text" lines={2} />
          : (
            <>
              <ProgressBar
                label="Spent this month"
                {...budgetMeter(spend.monthToDate, budget)}
                valueText={budgetValueText(spend.monthToDate, budget)}
                aria-describedby={labelId}
              />
              <p className={styles.projection}>
                <span>{`Projected ${formatMoney(spend.projected, 'EUR')} by month end`}</span>
                {budget === 0 && <span>No budget</span>}
                {budget > 0 && spend.projected > budget && <Badge tone="warning">Projected to exceed</Badge>}
                {budget > 0 && spend.monthToDate >= budget && <Badge tone="negative">Budget spent</Badge>}
              </p>
            </>
          )}
      </div>
    </li>
  )
}

function BudgetSummary({ spend }: { readonly spend: readonly BudgetSpend[] }) {
  const budgets = useEffectiveBudgets()
  const budgeted = [...budgets.values()].reduce((sum, amount) => sum + amount, 0)
  const spent = spend.reduce((sum, entry) => sum + entry.monthToDate, 0)
  const exceeding = spend.filter((entry) => {
    const budget = budgets.get(entry.categoryId) ?? 0
    return budget > 0 && entry.projected > budget
  }).length

  return (
    <div className={styles.summary}>
      <StatTile label="Budgeted this month" value={formatMoney(budgeted, 'EUR')} />
      <StatTile label="Spent month to date" value={formatMoney(spent, 'EUR')} />
      <StatTile
        label="Projected to exceed"
        value={`${formatCount(exceeding)} ${exceeding === 1 ? 'category' : 'categories'}`}
      />
    </div>
  )
}

export function BudgetsContent({ client = ledgerClient }: { readonly client?: LedgerClient }) {
  const [spend, setSpend] = useState<readonly BudgetSpend[] | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const feedVersion = useFeedEvents().length

  useEffect(() => {
    let current = true
    client.budgets().then(
      (found) => {
        if (current) {
          setSpend(found)
        }
      },
      (reason: unknown) => {
        if (current) {
          setFailure(reason instanceof Error ? reason : new Error('The budget spend request failed.'))
        }
      },
    )
    return () => {
      current = false
    }
  }, [client, feedVersion])

  if (failure !== null) {
    throw failure
  }

  return (
    <div className={styles.root} aria-busy={spend === null}>
      {spend === null ? <Skeleton variant="text" lines={2} /> : <BudgetSummary spend={spend} />}
      <ul className={styles.list}>
        {BUDGET_CATEGORIES.map((category) => (
          <BudgetRow key={category.id} category={category} spend={spend?.find((entry) => entry.categoryId === category.id)} />
        ))}
      </ul>
    </div>
  )
}
