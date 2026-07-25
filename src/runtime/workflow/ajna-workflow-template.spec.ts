import { describe, expect, it } from 'vitest'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  buildAjnaWorkflowRequest,
  renderAjnaWorkflowSummary,
  type AjnaWorkflowInput,
} from './ajna-workflow-template.js'
import { runRuntimeWorkflow, renderWorkflowResult } from './runtime-workflow.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from '../registry/fixture-registry-factory.js'
import { renderRuntimeAjnaWorkflow } from '../../cli-runtime-ajna-workflow.js'

describe('buildAjnaWorkflowRequest', () => {
  it('builds review-only workflow with PR read and review steps', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'review',
    }
    const request = buildAjnaWorkflowRequest(input)

    expect(request.name).toContain('ajna-review')
    expect(request.steps).toHaveLength(2)
    expect(request.steps[0]?.toolName).toBe('github_live_read_pr')
    expect(request.steps[1]?.toolName).toBe('ajna_live_read_review')
  })

  it('builds merge-readiness workflow with PR read and merge-readiness steps', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'merge-readiness',
    }
    const request = buildAjnaWorkflowRequest(input)

    expect(request.steps).toHaveLength(2)
    expect(request.steps[0]?.toolName).toBe('github_live_read_pr')
    expect(request.steps[1]?.toolName).toBe('ajna_live_read_merge_readiness')
  })

  it('builds full workflow with PR read, review, and merge-readiness steps', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'full',
    }
    const request = buildAjnaWorkflowRequest(input)

    expect(request.steps).toHaveLength(3)
    expect(request.steps[0]?.toolName).toBe('github_live_read_pr')
    expect(request.steps[1]?.toolName).toBe('ajna_live_read_review')
    expect(request.steps[2]?.toolName).toBe('ajna_live_read_merge_readiness')
  })

  it('includes CI read step when workflowRunId is provided', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      workflowRunId: 100,
      mode: 'review',
    }
    const request = buildAjnaWorkflowRequest(input)

    expect(request.steps).toHaveLength(3)
    expect(request.steps[0]?.toolName).toBe('github_live_read_pr')
    expect(request.steps[1]?.toolName).toBe('github_live_read_ci')
    expect(request.steps[2]?.toolName).toBe('ajna_live_read_review')
  })

  it('includes CI read step in full mode with workflowRunId', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      workflowRunId: 100,
      mode: 'full',
    }
    const request = buildAjnaWorkflowRequest(input)

    expect(request.steps).toHaveLength(4)
    expect(request.steps.map((s) => s.toolName)).toEqual([
      'github_live_read_pr',
      'github_live_read_ci',
      'ajna_live_read_review',
      'ajna_live_read_merge_readiness',
    ])
  })

  it('passes owner/repo/prNumber to each step input', () => {
    const input: AjnaWorkflowInput = {
      owner: 'my-org',
      repo: 'my-repo',
      prNumber: 99,
      mode: 'review',
    }
    const request = buildAjnaWorkflowRequest(input)

    for (const step of request.steps) {
      expect(step.input['owner']).toBe('my-org')
      expect(step.input['repo']).toBe('my-repo')
    }
  })

  it('sets maxSteps to 10', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'review',
    }
    const request = buildAjnaWorkflowRequest(input)
    expect(request.maxSteps).toBe(10)
  })
})

describe('renderAjnaWorkflowSummary', () => {
  it('renders review mode summary', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 42,
      mode: 'review',
    }
    const output = renderAjnaWorkflowSummary(input)

    expect(output).toContain('Ajna workflow template')
    expect(output).toContain('review')
    expect(output).toContain('org/repo')
    expect(output).toContain('#42')
  })

  it('renders full mode as "review + merge-readiness"', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'full',
    }
    const output = renderAjnaWorkflowSummary(input)
    expect(output).toContain('review + merge-readiness')
  })

  it('includes workflow run ID when present', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      workflowRunId: 555,
      mode: 'review',
    }
    const output = renderAjnaWorkflowSummary(input)
    expect(output).toContain('555')
  })

  it('omits workflow line when workflowRunId is absent', () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'review',
    }
    const output = renderAjnaWorkflowSummary(input)
    expect(output).not.toContain('Workflow:')
  })
})

describe('Ajna workflow end-to-end through runner', () => {
  it('runs a review workflow through the runner', async () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'review',
    }
    const request = buildAjnaWorkflowRequest(input)
    const registry = createFixtureRegistry('workflow')
    const context = createFixtureContext()

    const result = await runRuntimeWorkflow(request, registry, context)

    expect(result.stepsExecuted).toBeGreaterThanOrEqual(1)
    expect(result.auditLog.length).toBeGreaterThanOrEqual(1)
  })

  it('renders workflow result with boundary lines', async () => {
    const input: AjnaWorkflowInput = {
      owner: 'org',
      repo: 'repo',
      prNumber: 1,
      mode: 'review',
    }
    const request = buildAjnaWorkflowRequest(input)
    const registry = createFixtureRegistry('workflow')
    const context = createFixtureContext()

    const result = await runRuntimeWorkflow(request, registry, context)
    const output = renderWorkflowResult(result)

    expect(output).toContain('governed composition only')
    expect(output).toContain('no new mutation surface')
  })
})

describe('renderRuntimeAjnaWorkflow (CLI)', () => {
  it('runs an Ajna workflow from a fixture file', async () => {
    const dir = join(tmpdir(), `ajna-workflow-cli-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'ajna-workflow.json')
    await writeFile(
      fixturePath,
      JSON.stringify({
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 42,
        mode: 'review',
      }),
    )

    const output = await renderRuntimeAjnaWorkflow(fixturePath)

    expect(output).toContain('Ajna workflow template')
    expect(output).toContain('test-org/test-repo')
    expect(output).toContain('#42')
    expect(output).toContain('SymbolWright runtime workflow result')
  })

  it('throws when owner is missing', async () => {
    const dir = join(tmpdir(), `ajna-workflow-owner-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'bad.json')
    await writeFile(fixturePath, JSON.stringify({ repo: 'r', prNumber: 1, mode: 'review' }))

    await expect(renderRuntimeAjnaWorkflow(fixturePath)).rejects.toThrow(
      'Missing or invalid owner.',
    )
  })

  it('throws when repo is missing', async () => {
    const dir = join(tmpdir(), `ajna-workflow-repo-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'bad.json')
    await writeFile(fixturePath, JSON.stringify({ owner: 'o', prNumber: 1, mode: 'review' }))

    await expect(renderRuntimeAjnaWorkflow(fixturePath)).rejects.toThrow('Missing or invalid repo.')
  })

  it('throws when prNumber is missing', async () => {
    const dir = join(tmpdir(), `ajna-workflow-pr-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'bad.json')
    await writeFile(fixturePath, JSON.stringify({ owner: 'o', repo: 'r', mode: 'review' }))

    await expect(renderRuntimeAjnaWorkflow(fixturePath)).rejects.toThrow(
      'Missing or invalid prNumber.',
    )
  })

  it('throws when mode is invalid', async () => {
    const dir = join(tmpdir(), `ajna-workflow-mode-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'bad.json')
    await writeFile(
      fixturePath,
      JSON.stringify({ owner: 'o', repo: 'r', prNumber: 1, mode: 'invalid' }),
    )

    await expect(renderRuntimeAjnaWorkflow(fixturePath)).rejects.toThrow('Missing or invalid mode.')
  })

  it('accepts full mode with workflowRunId', async () => {
    const dir = join(tmpdir(), `ajna-workflow-full-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'full.json')
    await writeFile(
      fixturePath,
      JSON.stringify({
        owner: 'org',
        repo: 'repo',
        prNumber: 1,
        workflowRunId: 200,
        mode: 'full',
      }),
    )

    const output = await renderRuntimeAjnaWorkflow(fixturePath)
    expect(output).toContain('review + merge-readiness')
    expect(output).toContain('200')
  })
})
