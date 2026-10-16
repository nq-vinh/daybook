import { describe, expect, it } from 'vitest'

import { TODAY, TODAY_ISO } from '../../src/domain/world'

describe('world', () => {
  it('pins today to the fixed world date', () => {
    expect(new Date(TODAY).toISOString()).toBe(TODAY_ISO)
  })
})
