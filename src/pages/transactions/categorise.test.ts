import { act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { cancelAllForTest, undo } from '../../state/optimistic'
import { dismiss, dismissAllToasts, getToasts } from '../../state/toast'
import { categoriseWithUndo, undoTitle } from './categorise'

afterEach(() => {
  cancelAllForTest()
  act(() => {
    dismissAllToasts()
  })
})

describe('undoTitle', () => {
  it('repeats the verb and names skipped rows', () => {
    expect(undoTitle({ restored: 1, total: 1 })).toBe('Restored the previous category')
    expect(undoTitle({ restored: 0, total: 1 })).toBe('Kept the newer category')
    expect(undoTitle({ restored: 3, total: 3 })).toBe('Restored the previous category for 3 transactions')
    expect(undoTitle({ restored: 2, total: 3 })).toBe('Restored the previous category for 2 of 3 transactions')
    expect(undoTitle({ restored: 0, total: 1_200 })).toBe('Kept the newer categories for 1,200 transactions')
  })
})

describe('categoriseWithUndo', () => {
  it('releases the action when its toast is dismissed, so undo is refused afterwards', () => {
    const handle = categoriseWithUndo([1], 'travel', 'Categorised as Travel')
    const raised = getToasts().find((candidate) => candidate.title === 'Categorised as Travel')
    if (raised === undefined) {
      throw new Error('Expected the categorise toast.')
    }

    act(() => {
      dismiss(raised.id)
    })

    expect(undo(handle.id)).toBeNull()
  })
})
