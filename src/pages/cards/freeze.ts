import type { CARDS } from '../../domain/world'
import type { CardStatus } from '../../state/edits'
import { cardsAction, type CommitHandle, commitLater, release, undo } from '../../state/optimistic'
import { toast } from '../../state/toast'

type Card = (typeof CARDS)[number]

export function freezeTitle(card: Card, status: CardStatus): string {
  return `${status === 'frozen' ? 'Froze' : 'Unfroze'} the card ending ${card.last4}`
}

export function setCardStatusWithUndo(card: Card, status: CardStatus): CommitHandle {
  const action = cardsAction(card.id, status)
  const handle = commitLater(action)
  toast({
    title: freezeTitle(card, status),
    action: {
      label: 'Undo',
      onAction: () => {
        const result = undo(handle.id)
        if (result !== null) {
          toast({
            title: result.restored === 1 ? freezeTitle(card, action.previous) : `Kept the newer setting for the card ending ${card.last4}`,
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
