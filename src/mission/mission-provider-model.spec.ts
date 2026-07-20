import { describe, expect, it } from 'vitest'

import type { CodeMindMission } from './mission-types.js'

describe('mission provider selection', () => {
  it('models provider identity and model without credential fields', () => {
    const agent: CodeMindMission['agent'] = {
      runtimeMode: 'READ_ONLY',
      activeProviderId: 'anthropic',
      model: 'claude-test',
      messages: [],
    }
    expect(agent.activeProviderId).toBe('anthropic')
    expect(agent).not.toHaveProperty('apiKey')
  })
})
