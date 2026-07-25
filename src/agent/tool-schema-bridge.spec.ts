import { describe, expect, it } from 'vitest'

import {
  buildToolInputSchema,
  bridgeToolsForProvider,
  extractProviderTools,
} from './tool-schema-bridge.js'
import type { RuntimeToolDefinition, RuntimePolicySnapshot } from '../runtime/types.js'
import { ALL_SYMBOLWRIGHT_TOOL_NAMES } from '../runtime/types.js'

function makeTool(name: string, capability: string): RuntimeToolDefinition {
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
    allowReadOnlyNetwork: true,
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

    it('returns schema for local_file_write', () => {
      const tool = makeTool('local_file_write', 'LOCAL_FILE_WRITE')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('targetPath')
      expect(schema.properties).toHaveProperty('content')
      expect(schema.required).toContain('targetPath')
      expect(schema.required).toContain('content')
    })

    it('returns schema for pr_collaboration', () => {
      const tool = makeTool('pr_collaboration', 'GITHUB_PR_COLLABORATION')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('action')
      expect(schema.properties).toHaveProperty('repository')
      expect(schema.properties).toHaveProperty('prNumber')
      expect(schema.required).toContain('action')
    })

    it('returns schema for github_create_pr', () => {
      const tool = makeTool('github_create_pr', 'GITHUB_PR_CREATION')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('repository')
      expect(schema.properties).toHaveProperty('title')
      expect(schema.properties).toHaveProperty('files')
      expect(schema.required).toContain('repository')
      expect(schema.required).toContain('files')
    })

    it('returns schema for github_write_gate', () => {
      const tool = makeTool('github_write_gate', 'GITHUB_WRITE_GATE')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('action')
      expect(schema.properties).toHaveProperty('repository')
      expect(schema.required).toContain('action')
    })

    it('returns schema for github_write_proposal', () => {
      const tool = makeTool('github_write_proposal', 'GITHUB_WRITE_PROPOSAL')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('action')
      expect(schema.properties).toHaveProperty('reason')
      expect(schema.required).toContain('reason')
    })

    it('returns schema for fixture review tools', () => {
      const prTool = makeTool('github_pr_fixture_review', 'EVIDENCE_READ')
      const ciTool = makeTool('github_ci_fixture_review', 'EVIDENCE_READ')

      expect(buildToolInputSchema(prTool).properties).toHaveProperty('path')
      expect(buildToolInputSchema(ciTool).properties).toHaveProperty('path')
      expect(buildToolInputSchema(prTool).required).toContain('path')
    })

    it('returns schema for live_read tools', () => {
      const policyTool = makeTool('live_read_policy_handshake', 'POLICY_CHECK')
      const clientTool = makeTool('live_read_client_fixture', 'EVIDENCE_READ')

      expect(buildToolInputSchema(policyTool).properties).toHaveProperty('path')
      expect(buildToolInputSchema(clientTool).properties).toHaveProperty('path')
    })

    it('returns schema for zflow_report', () => {
      const tool = makeTool('zflow_report', 'ZFLOW_REPORT')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('id')
      expect(schema.properties).toHaveProperty('format')
      expect(schema.properties).toHaveProperty('result')
      expect(schema.properties).toHaveProperty('readiness')
      expect(schema.required).toContain('id')
    })

    it('returns schema for zflow_report_rollup', () => {
      const tool = makeTool('zflow_report_rollup', 'ZFLOW_REPORT_CATALOG')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('title')
      expect(schema.properties).toHaveProperty('catalog')
      expect(schema.required).toContain('title')
    })

    it('returns schema for zflow_report_catalog', () => {
      const tool = makeTool('zflow_report_catalog', 'ZFLOW_REPORT_CATALOG')
      const schema = buildToolInputSchema(tool)

      expect(schema.properties).toHaveProperty('title')
      expect(schema.properties).toHaveProperty('reports')
      expect(schema.required).toContain('reports')
    })

    it('throws for tools without registered schema', () => {
      const tool = makeTool('unknown_tool' as string, 'READ')

      expect(() => buildToolInputSchema(tool)).toThrow('no registered input schema')
    })

    it('every SymbolWrightToolName has a registered schema', () => {
      for (const name of ALL_SYMBOLWRIGHT_TOOL_NAMES) {
        const tool = makeTool(name, 'READ')
        const schema = buildToolInputSchema(tool)

        expect(schema.type).toBe('object')
        expect(schema.properties).toBeDefined()
      }
    })

    it('every schema with required fields has matching properties', () => {
      const NO_INPUT_TOOLS = new Set(['run_tests', 'run_typecheck', 'run_lint'])

      for (const name of ALL_SYMBOLWRIGHT_TOOL_NAMES) {
        const tool = makeTool(name, 'READ')
        const schema = buildToolInputSchema(tool)

        if (NO_INPUT_TOOLS.has(name)) {
          expect(Object.keys(schema.properties)).toHaveLength(0)
        } else {
          expect(
            Object.keys(schema.properties).length,
            `${name} schema should have at least one property`,
          ).toBeGreaterThan(0)
        }

        if (schema.required !== undefined) {
          for (const field of schema.required) {
            expect(
              schema.properties,
              `${name}: required field "${field}" missing from properties`,
            ).toHaveProperty(field)
          }
        }
      }
    })
  })

  describe('bridgeToolsForProvider', () => {
    const tools = [
      makeTool('plan_goal', 'PLAN'),
      makeTool('read_file', 'READ'),
      makeTool('propose_edit', 'PROPOSE'),
      makeTool('local_file_write', 'LOCAL_FILE_WRITE'),
    ]

    it('filters tools by READ_ONLY mode', () => {
      const bridged = bridgeToolsForProvider(tools, makePolicy('READ_ONLY'))
      const names = bridged.map((bt) => bt.providerTool.name)

      expect(names).toContain('plan_goal')
      expect(names).toContain('read_file')
      expect(names).not.toContain('propose_edit')
      expect(names).not.toContain('local_file_write')
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
      expect(names).not.toContain('local_file_write')
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
