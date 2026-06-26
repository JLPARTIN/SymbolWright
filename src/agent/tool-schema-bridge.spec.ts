import { describe, expect, it } from 'vitest'

import {
  buildToolInputSchema,
  bridgeToolsForProvider,
  extractProviderTools,
} from './tool-schema-bridge.js'
import type { RuntimeToolDefinition, RuntimePolicySnapshot } from '../runtime/types.js'

function makeTool(
  name: string,
  capability: string,
): RuntimeToolDefinition {
  return {
    name: name as RuntimeToolDefinition['name'],
    description: `Test tool: ${name}`,
    capability: capability as RuntimeToolDefinition['capability'],
    execute: async () => 'result',
  }
}

function makePolicy(mode: RuntimePolicySnapshot['mode']): RuntimePolicySnapshot {
  return {
    mode,
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  }
}

describe('tool-schema-bridge', () => {
  describe('buildToolInputSchema', () => {
    it('returns schema for plan_goal', () => {
      const tool = makeTool('plan_goal', 'PLAN')
      const schema = buildToolInputSchema(tool)

      expect(schema.type).toBe('object')
      expect(schema.properties).toHaveProperty('goal')
      expect(schema.required).toContain('goal')
    })

    it('returns schema for read_file', () => {
      const tool = makeTool('read_file', 'READ')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('path')
      expect(schema.required).toContain('path')
    })

    it('returns schema for search_files', () => {
      const tool = makeTool('search_files', 'SEARCH')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('query')
      expect(schema.required).toContain('query')
    })

    it('returns generic schema for unknown tools', () => {
      const tool = makeTool('unknown_tool' as string, 'READ')
      const schema = buildToolInputSchema(tool)

      expect(schema.type).toBe('object')
      expect(schema.properties).toHaveProperty('input')
    })
  })

  describe('bridgeToolsForProvider', () => {
    const tools = [
      makeTool('plan_goal', 'PLAN'),
      makeTool('read_file', 'READ'),
      makeTool('propose_edit', 'PROPOSE'),
      makeTool('apply_edit_gated', 'APPROVED_EDIT'),
    ]

    it('filters tools by READ_ONLY mode', () => {
      const bridged = bridgeToolsForProvider(tools, makePolicy('READ_ONLY'))
      const names = bridged.map((bt) => bt.providerTool.name)

      expect(names).toContain('plan_goal')
      expect(names).toContain('read_file')
      expect(names).not.toContain('propose_edit')
      expect(names).not.toContain('apply_edit_gated')
    })

    it('filters tools by PLAN_ONLY mode', () => {
      const bridged = bridgeToolsForProvider(tools, makePolicy('PLAN_ONLY'))
      const names = bridged.map((bt) => bt.providerTool.name)

      expect(names).toContain('plan_goal')
      expect(names).toContain('read_file')
      expect(names).not.toContain('propose_edit')
    })

    it('includes proposal tools in PROPOSAL_ONLY mode', () => {
      const bridged = bridgeToolsForProvider(tools, makePolicy('PROPOSAL_ONLY'))
      const names = bridged.map((bt) => bt.providerTool.name)

      expect(names).toContain('propose_edit')
      expect(names).not.toContain('apply_edit_gated')
    })

    it('includes all tools in APPROVED_EXECUTION mode', () => {
      const bridged = bridgeToolsForProvider(tools, makePolicy('APPROVED_EXECUTION'))
      expect(bridged).toHaveLength(4)
    })

    it('preserves runtime tool reference', () => {
      const bridged = bridgeToolsForProvider(tools, makePolicy('READ_ONLY'))
      for (const bt of bridged) {
        expect(bt.runtimeTool).toBeDefined()
        expect(bt.runtimeTool.name).toBe(bt.providerTool.name)
      }
    })
  })

  describe('extractProviderTools', () => {
    it('extracts provider tool definitions', () => {
      const tools = [makeTool('read_file', 'READ')]
      const bridged = bridgeToolsForProvider(tools, makePolicy('APPROVED_EXECUTION'))
      const providerTools = extractProviderTools(bridged)

      expect(providerTools).toHaveLength(1)
      expect(providerTools[0]?.name).toBe('read_file')
      expect(providerTools[0]?.description).toContain('read_file')
      expect(providerTools[0]?.inputSchema).toBeDefined()
    })
  })
})
