import { describe, expect, it } from 'vitest'

import { parseCreateMissionInput } from './mission-validation.js'

describe('mission objective bounds', () => {
  it('rejects objectives above the persistence limit', () => {
    expect(() =>
      parseCreateMissionInput({
        name: 'Long',
        objective: 'x'.repeat(32_001),
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    ).toThrow('32000')
  })
})
