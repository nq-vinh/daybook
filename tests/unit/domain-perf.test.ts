import { describe, expect, it } from 'vitest'

import { transaction, TRANSACTION_COUNT } from '../../src/domain/transactions'

describe('domain performance', () => {
  it('generates all 100k transactions well within budget', () => {
    const started = performance.now()
    for (let id = 0; id < TRANSACTION_COUNT; id += 1) {
      transaction(id)
    }
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})
