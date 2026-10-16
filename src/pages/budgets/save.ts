import { formatMoney } from '../../domain/format'
import type { ExpenseCategoryId } from '../../domain/world'
import { budgetsAction, type CommitHandle, commitLater, release, undo } from '../../state/optimistic'
import { toast } from '../../state/toast'

export interface BudgetCategory {
  readonly id: ExpenseCategoryId
  readonly label: string
}

export function saveBudgetWithUndo(category: BudgetCategory, monthlyAmount: number): CommitHandle {
  const action = budgetsAction(category.id, monthlyAmount)
  const handle = commitLater(action)
  toast({
    title: `Saved the ${category.label} budget as ${formatMoney(monthlyAmount, 'EUR')}`,
    action: {
      label: 'Undo',
      onAction: () => {
        const result = undo(handle.id)
        if (result !== null) {
          toast({
            title: result.restored === 1
              ? `Restored the ${category.label} budget to ${formatMoney(action.previous, 'EUR')}`
              : `Kept the newer ${category.label} budget`,
          })
        }
      },
    },
    onDismiss: () => {
      release(handle.id)
    },
  })
  return handle
}
