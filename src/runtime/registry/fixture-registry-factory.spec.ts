import { describe, expect, it } from 'vitest'

import {
  createFixtureRegistry,
  createFixtureContext,
  type FixtureRegistryPreset,
} from './fixture-registry-factory.js'

const CUMULATIVE_PRESETS: readonly FixtureRegistryPreset[] = [
  'read_only',
  'proposal',
  'github_read',
  'live_read_policy',
  'live_read_client',
  'github_live_read',
  'ajna_live_read',
  'operator_review',
  'write_prep',
  'local_write',
  'validation_command',
  'pr_preparation',
  'github_write_proposal',
  'github_write_gate',
  'workflow',
  'github_pr_creation',
  'pr_collaboration',
]

describe('createFixtureRegistry', () => {
  it('read_only includes the 5 base tools', () => {
    const registry = createFixtureRegistry('read_only')
    const names = registry.list().map((t) => t.name)

    expect(names).toContain('plan_goal')
    expect(names).toContain('list_files')
    expect(names).toContain('read_file')
    expect(names).toContain('search_files')
    expect(names).toContain('validation_plan')
    expect(names).toHaveLength(5)
  })

  it('proposal extends read_only with 3 tools', () => {
    const registry = createFixtureRegistry('proposal')
    const names = registry.list().map((t) => t.name)

    expect(names).toContain('propose_edit')
    expect(names).toContain('pr_notes')
    expect(names).toContain('ci_review')
    expect(names.length).toBe(8)
  })

  it('github_read extends proposal with fixture review tools', () => {
    const registry = createFixtureRegistry('github_read')
    const names = registry.list().map((t) => t.name)

    expect(names).toContain('github_pr_fixture_review')
    expect(names).toContain('github_ci_fixture_review')
    expect(names.length).toBe(10)
  })

  it('each cumulative preset includes all tools from the previous preset', () => {
    for (let i = 1; i < CUMULATIVE_PRESETS.length; i++) {
      const prevNames = createFixtureRegistry(CUMULATIVE_PRESETS[i - 1]!)
        .list()
        .map((t) => t.name)
      const currNames = createFixtureRegistry(CUMULATIVE_PRESETS[i]!)
        .list()
        .map((t) => t.name)

      for (const name of prevNames) {
        expect(currNames).toContain(name)
      }
    }
  })

  it('pr_collaboration is the largest cumulative preset', () => {
    const registry = createFixtureRegistry('pr_collaboration')
    const names = registry.list().map((t) => t.name)

    expect(names).toContain('plan_goal')
    expect(names).toContain('pr_collaboration')
    expect(names.length).toBeGreaterThanOrEqual(20)
  })

  it('approved branches from proposal with gated tools', () => {
    const registry = createFixtureRegistry('approved')
    const names = registry.list().map((t) => t.name)

    expect(names).toContain('plan_goal')
    expect(names).toContain('propose_edit')
    expect(names).toContain('apply_edit_gated')
    expect(names).toContain('command_dry_run_gated')
    expect(names).not.toContain('github_pr_fixture_review')
  })

  it('patch_application includes apply_patch from local_write base', () => {
    const registry = createFixtureRegistry('patch_application')
    const names = registry.list().map((t) => t.name)

    expect(names).toContain('apply_patch')
    expect(names).toContain('local_file_write')
    expect(names).not.toContain('validation_command_gate')
  })

  it('local_self_edit includes apply_patch from validation_command base', () => {
    const registry = createFixtureRegistry('local_self_edit')
    const names = registry.list().map((t) => t.name)

    expect(names).toContain('apply_patch')
    expect(names).toContain('validation_command_gate')
  })

  it('zflow_report is standalone', () => {
    const registry = createFixtureRegistry('zflow_report')
    const names = registry.list().map((t) => t.name)

    expect(names).toEqual(['zflow_report'])
  })

  it('zflow_report_catalog is standalone', () => {
    const registry = createFixtureRegistry('zflow_report_catalog')
    const names = registry.list().map((t) => t.name)

    expect(names).toEqual(['zflow_report_catalog'])
  })

  it('workflow and github_write_gate produce the same tools', () => {
    const workflowNames = createFixtureRegistry('workflow')
      .list()
      .map((t) => t.name)
    const gateNames = createFixtureRegistry('github_write_gate')
      .list()
      .map((t) => t.name)

    expect(workflowNames).toEqual(gateNames)
  })

  it('accepts FakeLiveReadClientData for live read presets', () => {
    const registry = createFixtureRegistry('github_live_read', {
      prTitle: 'Test PR',
      prBody: 'Test body',
    })
    expect(registry.has('github_live_read_pr')).toBe(true)
    expect(registry.has('github_live_read_ci')).toBe(true)
  })
})

describe('createFixtureContext', () => {
  it('returns a context with default READ_ONLY policy', () => {
    const context = createFixtureContext()

    expect(context.policy.mode).toBe('READ_ONLY')
    expect(context.policy.allowNetwork).toBe(false)
    expect(context.policy.allowShell).toBe(false)
    expect(context.policy.allowWrites).toBe(false)
  })

  it('uses process.cwd() as default working directory', () => {
    const context = createFixtureContext()
    expect(context.cwd).toBe(process.cwd())
  })

  it('accepts a custom working directory', () => {
    const context = createFixtureContext('/tmp/test')
    expect(context.cwd).toBe('/tmp/test')
  })
})
