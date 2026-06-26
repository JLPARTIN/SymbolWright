import { describe, expect, it } from 'vitest'

import { HiveMindRegistry } from './hivemind-registry.js'

describe('HiveMindRegistry', () => {
  describe('default configuration', () => {
    const registry = new HiveMindRegistry()

    it('has all 5 agent types', () => {
      const types = registry.listAgentTypes()
      expect(types).toContain('investigator')
      expect(types).toContain('coder')
      expect(types).toContain('analyzer')
      expect(types).toContain('reviewer')
      expect(types).toContain('reporter')
    })

    it('investigator maps to researcher role', () => {
      const config = registry.getConfig('investigator')
      expect(config?.role).toBe('researcher')
      expect(config?.capabilities.canRead).toBe(true)
      expect(config?.capabilities.canWrite).toBe(false)
    })

    it('coder maps to coder role', () => {
      const config = registry.getConfig('coder')
      expect(config?.role).toBe('coder')
      expect(config?.capabilities.canRead).toBe(true)
      expect(config?.capabilities.canWrite).toBe(true)
    })

    it('analyzer maps to validator role', () => {
      const config = registry.getConfig('analyzer')
      expect(config?.role).toBe('validator')
      expect(config?.capabilities.canExecuteCommands).toBe(true)
    })

    it('reviewer maps to validator role with review capability', () => {
      const config = registry.getConfig('reviewer')
      expect(config?.role).toBe('validator')
      expect(config?.capabilities.canReview).toBe(true)
    })

    it('reporter maps to memory-auditor role', () => {
      const config = registry.getConfig('reporter')
      expect(config?.role).toBe('memory-auditor')
    })
  })

  describe('getConfigForRole', () => {
    const registry = new HiveMindRegistry()

    it('maps researcher role to investigator config', () => {
      const config = registry.getConfigForRole('researcher')
      expect(config?.agentType).toBe('investigator')
    })

    it('maps coder role to coder config', () => {
      const config = registry.getConfigForRole('coder')
      expect(config?.agentType).toBe('coder')
    })

    it('maps validator role to analyzer config', () => {
      const config = registry.getConfigForRole('validator')
      expect(config?.agentType).toBe('analyzer')
    })

    it('maps memory-auditor role to reporter config', () => {
      const config = registry.getConfigForRole('memory-auditor')
      expect(config?.agentType).toBe('reporter')
    })
  })

  describe('createAgent', () => {
    it('creates agent with unique id', () => {
      const registry = new HiveMindRegistry()
      const agent1 = registry.createAgent('investigator')
      const agent2 = registry.createAgent('investigator')

      expect(agent1?.agentId).not.toBe(agent2?.agentId)
      expect(agent1?.agentType).toBe('investigator')
      expect(agent1?.status).toBe('idle')
    })

    it('returns undefined for unknown type', () => {
      const registry = new HiveMindRegistry([])
      const agent = registry.createAgent('investigator')
      expect(agent).toBeUndefined()
    })
  })

  describe('roleToAgentType', () => {
    const registry = new HiveMindRegistry()

    it('maps all kernel roles to swarm agent types', () => {
      expect(registry.roleToAgentType('orchestrator')).toBe('investigator')
      expect(registry.roleToAgentType('researcher')).toBe('investigator')
      expect(registry.roleToAgentType('coder')).toBe('coder')
      expect(registry.roleToAgentType('validator')).toBe('analyzer')
      expect(registry.roleToAgentType('scheduler')).toBe('reporter')
      expect(registry.roleToAgentType('memory-auditor')).toBe('reporter')
    })
  })
})
