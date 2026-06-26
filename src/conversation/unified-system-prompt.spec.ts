import { describe, expect, it } from 'vitest'

import { buildUnifiedSystemPrompt } from './unified-system-prompt.js'

describe('buildUnifiedSystemPrompt', () => {
  it('includes base identity and doctrine', () => {
    const prompt = buildUnifiedSystemPrompt()
    expect(prompt).toContain('CodeMind')
    expect(prompt).toContain('Identity')
    expect(prompt).toContain('Doctrine')
    expect(prompt).toContain('AELIB-X1YA0I')
  })

  it('includes base system prompt content', () => {
    const prompt = buildUnifiedSystemPrompt({ projectName: 'TestProject' })
    expect(prompt).toContain('Project: TestProject')
  })

  it('includes swarm agent section when agents specified', () => {
    const prompt = buildUnifiedSystemPrompt({
      swarmAgentTypes: ['investigator', 'coder'],
    })
    expect(prompt).toContain('HiveMind Swarm Agents')
    expect(prompt).toContain('investigator')
    expect(prompt).toContain('coder')
  })

  it('uses custom swarm descriptions', () => {
    const prompt = buildUnifiedSystemPrompt({
      swarmAgentTypes: ['analyzer'],
      swarmDescriptions: { analyzer: 'Custom analyzer description' },
    })
    expect(prompt).toContain('Custom analyzer description')
  })

  it('includes ajna section when active', () => {
    const prompt = buildUnifiedSystemPrompt({
      ajnaStatus: {
        active: true,
        riskLevel: 'HIGH',
        mergeDecision: 'BLOCKED',
        findings: ['Missing test coverage'],
        lastReviewedAt: '2025-01-01T00:00:00.000Z',
      },
    })
    expect(prompt).toContain('Ajna Review Intelligence (Active)')
    expect(prompt).toContain('HIGH')
    expect(prompt).toContain('Missing test coverage')
  })

  it('omits ajna section when inactive', () => {
    const prompt = buildUnifiedSystemPrompt({
      ajnaStatus: {
        active: false,
        riskLevel: undefined,
        mergeDecision: undefined,
        findings: [],
        lastReviewedAt: undefined,
      },
    })
    expect(prompt).not.toContain('Ajna Review Intelligence')
  })

  it('includes permission mode', () => {
    const prompt = buildUnifiedSystemPrompt({
      permissionMode: 'READ_ONLY',
    })
    expect(prompt).toContain('Permission Mode')
    expect(prompt).toContain('READ_ONLY')
  })

  it('includes conversation summary', () => {
    const prompt = buildUnifiedSystemPrompt({
      conversationSummary: 'Previously explored src/ and found auth bug.',
    })
    expect(prompt).toContain('Conversation Context')
    expect(prompt).toContain('Previously explored src/')
  })

  it('includes governance boundaries from base context', () => {
    const prompt = buildUnifiedSystemPrompt({
      governanceBoundaries: ['No force-push allowed', 'All writes need approval'],
    })
    expect(prompt).toContain('No force-push allowed')
  })

  it('includes all swarm agent types with defaults', () => {
    const prompt = buildUnifiedSystemPrompt({
      swarmAgentTypes: ['investigator', 'coder', 'analyzer', 'reviewer', 'reporter'],
    })
    expect(prompt).toContain('investigator')
    expect(prompt).toContain('coder')
    expect(prompt).toContain('analyzer')
    expect(prompt).toContain('reviewer')
    expect(prompt).toContain('reporter')
  })
})
