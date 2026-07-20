import { describe, expect, it } from 'vitest'

import { parseCreateMissionInput } from './mission-validation.js'

describe('mission runtime modes', () => {
  it('accepts existing runtime policy modes and rejects unknown values', () => {
    for (const runtimeMode of ['READ_ONLY', 'PROPOSAL_ONLY', 'APPROVED_EXECUTION', 'PLAN_ONLY']) {
      expect(
        parseCreateMissionInput({
          name: 'Mode',
          objective: 'Use mode',
          workspaceKind: 'repository',
          repositoryPath: '.',
          runtimeMode,
        }).runtimeMode,
      ).toBe(runtimeMode)
    }
    expect(() =>
      parseCreateMissionInput({
        name: 'Mode',
        objective: 'Use mode',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'AUTONOMOUS',
      }),
    ).toThrow('runtimeMode')
  })
})
