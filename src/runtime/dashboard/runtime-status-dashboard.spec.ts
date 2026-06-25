import { describe, expect, it } from 'vitest'

import {
  buildRuntimeStatusSnapshot,
  renderRuntimeStatusDashboard,
} from './runtime-status-dashboard.js'
import { createWorkflowRuntimeContext, createWorkflowRuntimeRegistry } from '../runtime-workflow-registry.js'
import { renderRuntimeStatusDashboardCommand } from '../../cli-runtime-status-dashboard.js'

function createTestTools() {
  return createWorkflowRuntimeRegistry({}).list()
}

function createTestPolicy() {
  return createWorkflowRuntimeContext().policy
}

describe('buildRuntimeStatusSnapshot', () => {
  it('captures completed phase count', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    expect(snapshot.completedPhases).toBeGreaterThanOrEqual(18)
  })

  it('captures next phase as none when all phases are complete', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    expect(snapshot.nextPhase).toBe('none')
  })

  it('captures tool count and names', () => {
    const tools = createTestTools()
    const snapshot = buildRuntimeStatusSnapshot(tools, createTestPolicy())

    expect(snapshot.totalTools).toBe(tools.length)
    expect(snapshot.toolNames.length).toBe(tools.length)
    expect(snapshot.toolNames).toContain('plan_goal')
  })

  it('captures unique capabilities sorted', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())

    expect(snapshot.capabilities.length).toBeGreaterThan(0)
    const sorted = [...snapshot.capabilities].sort()
    expect(snapshot.capabilities).toEqual(sorted)
  })

  it('captures policy snapshot', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())

    expect(snapshot.policy.mode).toBeDefined()
    expect(snapshot.policy.allowNetwork).toBe(false)
    expect(snapshot.policy.allowShell).toBe(false)
    expect(snapshot.policy.allowWrites).toBe(false)
    expect(snapshot.policy.allowGitHubWrites).toBe(false)
  })

  it('reports workflow and Ajna workflow support', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())

    expect(snapshot.workflowSupport).toBe(true)
    expect(snapshot.ajnaWorkflowSupport).toBe(true)
  })
})

describe('renderRuntimeStatusDashboard', () => {
  it('renders dashboard header', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    const output = renderRuntimeStatusDashboard(snapshot)

    expect(output).toContain('CodeMind runtime status dashboard')
  })

  it('renders phase count and next phase', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    const output = renderRuntimeStatusDashboard(snapshot)

    expect(output).toContain('Completed phases:')
    expect(output).toContain('Next phase:')
  })

  it('renders tool count and tool list', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    const output = renderRuntimeStatusDashboard(snapshot)

    expect(output).toContain('Registered tools:')
    expect(output).toContain('plan_goal')
    expect(output).toContain('validation_plan')
  })

  it('renders policy details', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    const output = renderRuntimeStatusDashboard(snapshot)

    expect(output).toContain('Policy:')
    expect(output).toContain('allowNetwork:')
    expect(output).toContain('false')
  })

  it('renders workflow support flags', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    const output = renderRuntimeStatusDashboard(snapshot)

    expect(output).toContain('Workflow support:     YES')
    expect(output).toContain('Ajna workflow:        YES')
  })

  it('renders phase summary', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    const output = renderRuntimeStatusDashboard(snapshot)

    expect(output).toContain('Phase summary:')
    expect(output).toContain('Phase A:')
    expect(output).toContain('COMPLETE')
  })

  it('renders boundary', () => {
    const snapshot = buildRuntimeStatusSnapshot(createTestTools(), createTestPolicy())
    const output = renderRuntimeStatusDashboard(snapshot)

    expect(output).toContain('read-only status only')
    expect(output).toContain('no new mutation surface')
  })
})

describe('renderRuntimeStatusDashboardCommand (CLI)', () => {
  it('returns full dashboard output', () => {
    const output = renderRuntimeStatusDashboardCommand()

    expect(output).toContain('CodeMind runtime status dashboard')
    expect(output).toContain('Completed phases:')
    expect(output).toContain('Registered tools:')
    expect(output).toContain('Policy:')
    expect(output).toContain('Phase summary:')
  })
})
