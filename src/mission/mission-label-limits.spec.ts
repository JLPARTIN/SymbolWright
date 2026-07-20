import { describe, expect, it } from 'vitest'

import { parseCreateMissionInput } from './mission-validation.js'

describe('mission label bounds', () => {
  it('rejects too many labels', () => {
    expect(() =>
      parseCreateMissionInput({
        name: 'Labels',
        objective: 'Bound',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
        labels: Array.from({ length: 51 }, (_, index) => `label-${index}`),
      }),
    ).toThrow('50')
  })
})
