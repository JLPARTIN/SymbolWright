import { describe, expect, it } from 'vitest'

import { ALL_SYMBOLWRIGHT_TOOL_NAMES } from '../runtime/types.js'
import { isKnownCapability } from './access-capability-catalog.js'
import {
  requiredCapabilitiesForTool,
  resolveToolPermissionDescriptor,
  TOOL_PERMISSION_DESCRIPTORS,
} from './tool-permission-catalog.js'

describe('tool permission catalog', () => {
  it('declares a descriptor for every registered SymbolWright tool (fail-closed coverage)', () => {
    for (const toolName of ALL_SYMBOLWRIGHT_TOOL_NAMES) {
      expect(TOOL_PERMISSION_DESCRIPTORS[toolName]).toBeDefined()
    }
  })

  it('only references known, cataloged capabilities', () => {
    for (const toolName of ALL_SYMBOLWRIGHT_TOOL_NAMES) {
      for (const capability of requiredCapabilitiesForTool(toolName)) {
        expect(isKnownCapability(capability)).toBe(true)
      }
    }
  })

  it('returns undefined (fail closed) for an unregistered tool name', () => {
    expect(resolveToolPermissionDescriptor('not_a_real_tool')).toBeUndefined()
    expect(requiredCapabilitiesForTool('not_a_real_tool')).toEqual([])
  })

  it('requires a mutation-adjacent capability for edit_file and local_file_write', () => {
    expect(requiredCapabilitiesForTool('edit_file')).toContain('repo.content.update')
    expect(requiredCapabilitiesForTool('local_file_write')).toContain('repo.content.update')
  })
})
