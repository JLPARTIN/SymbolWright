import { describe, expect, it } from 'vitest'

import { parseCreateMissionInput } from './mission-validation.js'

describe('mission identity fields', () => {
  it('requires non-empty name and objective', () => {
    expect(() =>
      parseCreateMissionInput({
        name: '',
        objective: 'x',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    ).toThrow('name')
    expect(() =>
      parseCreateMissionInput({
        name: 'x',
        objective: '',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    ).toThrow('objective')
  })
})
