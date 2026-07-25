import { describe, expect, it } from 'vitest'

import type { SymbolWrightMission } from './mission-types.js'

describe('mission execution boundary', () => {
  it('contains status and resume state but no background execution scheduler', () => {
    const keys: Array<keyof SymbolWrightMission> = [
      'schemaVersion',
      'revision',
      'id',
      'name',
      'objective',
      'status',
      'createdAt',
      'updatedAt',
      'lastOpenedAt',
      'repository',
      'agent',
      'workspace',
      'evidence',
      'references',
      'labels',
    ]
    expect(keys).not.toContain('backgroundJob')
  })
})
