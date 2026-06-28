import { describe, expect, it } from 'vitest'

import {
  assembleAgentTools,
  assembleAgentToolsByCapability,
  getToolByName,
  assertToolAssemblyIntegrity,
  DYNAMICALLY_WIRED_TOOLS,
} from './tool-assembly.js'
import { ALL_CODEMIND_TOOL_NAMES } from '../types.js'

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
      const tools = assembleAgentToolsByCapability(['NONEXISTENT' as never])
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

  describe('assertToolAssemblyIntegrity', () => {
    it('passes for the current assembly', () => {
      expect(() => assertToolAssemblyIntegrity()).not.toThrow()
    })

    it('ALL_TOOLS covers every non-dynamic CodemindToolName', () => {
      const tools = assembleAgentTools()
      const assembledNames = new Set(tools.map((t) => t.name))
      const dynamicSet = new Set<string>(DYNAMICALLY_WIRED_TOOLS)

      for (const name of ALL_CODEMIND_TOOL_NAMES) {
        if (!dynamicSet.has(name)) {
          expect(assembledNames.has(name), `Missing tool: ${name}`).toBe(true)
        }
      }
    })

    it('DYNAMICALLY_WIRED_TOOLS are valid CodemindToolNames', () => {
      const allNamesSet = new Set<string>(ALL_CODEMIND_TOOL_NAMES)
      for (const name of DYNAMICALLY_WIRED_TOOLS) {
        expect(allNamesSet.has(name), `Invalid dynamic tool: ${name}`).toBe(true)
      }
    })
  })
})
