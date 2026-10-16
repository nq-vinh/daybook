import type { CategoryId } from '../../domain/world'
import { categoriesAction, type CommitHandle, commitLater, release, undo, type UndoResult } from '../../state/optimistic'
import { toast } from '../../state/toast'
import { formatCount } from './filters'

export function undoTitle({ restored, total }: UndoResult): string {
  if (total === 1) {
    return restored === 1 ? 'Restored the previous category' : 'Kept the newer category'
  }
  if (restored === 0) {
    return `Kept the newer categories for ${formatCount(total)} transactions`
  }
  const count = restored === total ? formatCount(total) : `${formatCount(restored)} of ${formatCount(total)}`
  return `Restored the previous category for ${count} transactions`
}

export function categoriseWithUndo(ids: Iterable<number>, categoryId: CategoryId, title: string): CommitHandle {
  const handle = commitLater(categoriesAction(ids, categoryId))
  toast({
    title,
    action: {
      label: 'Undo',
      onAction: () => {
        const result = undo(handle.id)
        if (result !== null) {
          toast({ title: undoTitle(result) })
        }
      },
    },
    onDismiss: () => {
      release(handle.id)
    },
  })
  return handle
}
