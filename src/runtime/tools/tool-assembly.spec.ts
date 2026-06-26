import { describe, expect, it } from 'vitest'

import { assembleAgentTools, assembleAgentToolsByCapability, getToolByName } from './tool-assembly.js'

describe('tool-assembly', () => {
  describe('assembleAgentTools', () => {
    it('returns a non-empty array of tools', () => {
      const tools = assembleAgentTools()
      expect(tools.length).toBeGreaterThan(20)
    })

    it('includes core tools', () => {
      const tools = assembleAgentTools()
      const names = tools.map((t) => t.name)

      expect(names).toContain('read_file')
      expect(names).toContain('list_files')
      expect(names).toContain('edit_file')
      expect(names).toContain('glob')
      expect(names).toContain('grep')
      expect(names).toContain('bash')
      expect(names).toContain('git')
    })

    it('every tool has name, description, capability, and execute', () => {
      const tools = assembleAgentTools()
      for (const tool of tools) {
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.capability).toBeTruthy()
        expect(typeof tool.execute).toBe('function')
      }
    })

    it('has no duplicate tool names', () => {
      const tools = assembleAgentTools()
      const names = tools.map((t) => t.name)
      const unique = new Set(names)
      expect(unique.size).toBe(names.length)
    })
  })

  describe('assembleAgentToolsByCapability', () => {
    it('filters to READ capability', () => {
      const tools = assembleAgentToolsByCapability(['READ'])
      expect(tools.length).toBeGreaterThan(0)
      for (const tool of tools) {
        expect(tool.capability).toBe('READ')
      }
    })

    it('returns empty for non-existent capability', () => {
      const tools = assembleAgentToolsByCapability(['NONEXISTENT'])
      expect(tools).toHaveLength(0)
    })
  })

  describe('getToolByName', () => {
    it('finds an existing tool', () => {
      const tool = getToolByName('read_file')
      expect(tool).toBeDefined()
      expect(tool?.name).toBe('read_file')
    })

    it('returns undefined for unknown tool', () => {
      const tool = getToolByName('totally_fake_tool')
      expect(tool).toBeUndefined()
    })
  })
})
