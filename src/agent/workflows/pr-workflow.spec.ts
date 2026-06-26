import { describe, expect, it } from 'vitest'

import type { CodemindChangedFileContext } from '../../repo-context/repo-context.types.js'
import {
  createPrWorkflowState,
  advancePrWorkflow,
  completePrWorkflow,
  renderPrWorkflowState,
} from './pr-workflow.js'

const DEFAULT_CONFIG = {
  repository: 'owner/repo',
  headRef: 'feature-branch',
  baseRef: 'main',
  headSha: 'abc123def456',
  baseSha: 'def456abc123',
  requireAjnaApproval: true,
} as const

function makeFile(overrides: Partial<CodemindChangedFileContext> = {}): CodemindChangedFileContext {
  return {
    path: 'src/example.ts',
    changeType: 'MODIFIED',
    additions: 10,
    deletions: 5,
    impactLevel: 'LOW',
    protectedPath: false,
    notes: [],
    ...overrides,
  }
}

describe('createPrWorkflowState', () => {
  it('starts in INVESTIGATE stage', () => {
    const state = createPrWorkflowState(DEFAULT_CONFIG)

    expect(state.stage).toBe('INVESTIGATE')
    expect(state.repository).toBe('owner/repo')
    expect(state.changedFiles).toHaveLength(0)
    expect(state.ajnaGateResult).toBeUndefined()
    expect(state.stageHistory).toEqual(['INVESTIGATE'])
  })
})

describe('advancePrWorkflow', () => {
  it('advances to PREPARE_PR for low-risk changes', () => {
    const initial = createPrWorkflowState(DEFAULT_CONFIG)
    const state = advancePrWorkflow(initial, [makeFile()])

    expect(state.stage).toBe('PREPARE_PR')
    expect(state.ajnaGateResult).toBeDefined()
    expect(state.ajnaGateResult!.verdict).toBe('APPROVED')
    expect(state.changedFiles).toHaveLength(1)
    expect(state.stageHistory).toContain('PREPARE_PR')
  })

  it('advances to REVIEW for operator-approval-required changes', () => {
    const config = { ...DEFAULT_CONFIG, requireAjnaApproval: true }
    const initial = createPrWorkflowState(config)
    const state = advancePrWorkflow(initial, [
      makeFile({
        path: 'src/critical.ts',
        impactLevel: 'CRITICAL',
        additions: 800,
        deletions: 400,
        protectedPath: true,
      }),
    ])

    expect(['REVIEW', 'BLOCKED']).toContain(state.stage)
  })

  it('preserves repository and branch info', () => {
    const initial = createPrWorkflowState(DEFAULT_CONFIG)
    const state = advancePrWorkflow(initial, [makeFile()])

    expect(state.repository).toBe('owner/repo')
    expect(state.headRef).toBe('feature-branch')
    expect(state.baseRef).toBe('main')
  })

  it('handles empty changed files', () => {
    const initial = createPrWorkflowState(DEFAULT_CONFIG)
    const state = advancePrWorkflow(initial, [])

    expect(state.stage).toBe('PREPARE_PR')
    expect(state.changedFiles).toHaveLength(0)
  })

  it('tracks stage history', () => {
    const initial = createPrWorkflowState(DEFAULT_CONFIG)
    const state = advancePrWorkflow(initial, [makeFile()])

    expect(state.stageHistory.length).toBeGreaterThanOrEqual(2)
    expect(state.stageHistory[0]).toBe('INVESTIGATE')
  })
})

describe('completePrWorkflow', () => {
  it('sets stage to COMPLETED', () => {
    const initial = createPrWorkflowState(DEFAULT_CONFIG)
    const advanced = advancePrWorkflow(initial, [makeFile()])
    const completed = completePrWorkflow(advanced)

    expect(completed.stage).toBe('COMPLETED')
    expect(completed.stageHistory).toContain('COMPLETED')
  })
})

describe('renderPrWorkflowState', () => {
  it('renders workflow state', () => {
    const initial = createPrWorkflowState(DEFAULT_CONFIG)
    const rendered = renderPrWorkflowState(initial)

    expect(rendered).toContain('PR Workflow')
    expect(rendered).toContain('INVESTIGATE')
    expect(rendered).toContain('owner/repo')
    expect(rendered).toContain('feature-branch')
  })

  it('renders Ajna verdict when present', () => {
    const initial = createPrWorkflowState(DEFAULT_CONFIG)
    const state = advancePrWorkflow(initial, [makeFile()])
    const rendered = renderPrWorkflowState(state)

    expect(rendered).toContain('Ajna verdict')
    expect(rendered).toContain('Risk level')
  })
})
