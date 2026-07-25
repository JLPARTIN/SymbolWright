import { describe, expect, it } from 'vitest'

import { ALL_SYMBOLWRIGHT_TOOL_NAMES } from '../runtime/types.js'
import {
  SUBAGENT_DEFINITIONS,
  SUBAGENT_NAMES,
  getSubagentDefinition,
  isSubagentName,
} from './subagent-definitions.js'

const ALL_TOOL_NAMES = new Set<string>(ALL_SYMBOLWRIGHT_TOOL_NAMES)

describe('SUBAGENT_NAMES', () => {
  it('is exactly the three read-only workers this bundle ships', () => {
    expect([...SUBAGENT_NAMES].sort()).toEqual(['explorer', 'reviewer', 'test-planner'])
  })
})

describe('isSubagentName', () => {
  it('recognizes the three names', () => {
    for (const name of SUBAGENT_NAMES) {
      expect(isSubagentName(name)).toBe(true)
    }
  })

  it('rejects unknown names', () => {
    expect(isSubagentName('coder')).toBe(false)
    expect(isSubagentName('')).toBe(false)
  })
})

describe('SUBAGENT_DEFINITIONS', () => {
  it('every definition is readonly mode', () => {
    for (const name of SUBAGENT_NAMES) {
      expect(SUBAGENT_DEFINITIONS[name].mode).toBe('readonly')
    }
  })

  it('every allowedTools and governedTools entry is a real, registered SymbolWrightToolName', () => {
    for (const name of SUBAGENT_NAMES) {
      const definition = SUBAGENT_DEFINITIONS[name]
      for (const tool of definition.allowedTools) {
        expect(ALL_TOOL_NAMES.has(tool)).toBe(true)
      }
      for (const tool of definition.governedTools) {
        expect(ALL_TOOL_NAMES.has(tool)).toBe(true)
      }
    }
  })

  it('no mutation-capable tool is allowed by default for any worker', () => {
    const mutationTools = new Set([
      'edit_file',
      'local_file_write',
      'apply_patch',
      'bash',
      'git',
      'github_create_pr',
      'github_write_proposal',
      'github_write_gate',
    ])

    for (const name of SUBAGENT_NAMES) {
      for (const tool of SUBAGENT_DEFINITIONS[name].allowedTools) {
        expect(mutationTools.has(tool)).toBe(false)
      }
    }
  })

  it('nested agent spawning is governed, not allowed, for every worker', () => {
    for (const name of SUBAGENT_NAMES) {
      const definition = SUBAGENT_DEFINITIONS[name]
      expect(definition.allowedTools).not.toContain('swarm_dispatch')
      expect(definition.allowedTools).not.toContain('subagent_run')
      expect(definition.governedTools).toContain('swarm_dispatch')
      expect(definition.governedTools).toContain('subagent_run')
    }
  })

  it('allowedTools and governedTools never overlap for the same worker', () => {
    for (const name of SUBAGENT_NAMES) {
      const definition = SUBAGENT_DEFINITIONS[name]
      const allowed = new Set(definition.allowedTools)
      for (const tool of definition.governedTools) {
        expect(allowed.has(tool)).toBe(false)
      }
    }
  })
})

describe('getSubagentDefinition', () => {
  it('returns the matching definition', () => {
    expect(getSubagentDefinition('explorer')?.name).toBe('explorer')
    expect(getSubagentDefinition('test-planner')?.name).toBe('test-planner')
  })

  it('returns undefined for an unknown name', () => {
    expect(getSubagentDefinition('coder')).toBeUndefined()
  })
})
