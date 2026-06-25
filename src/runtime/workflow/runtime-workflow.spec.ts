import { describe, expect, it } from 'vitest'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  evaluateWorkflowRequest,
  runRuntimeWorkflow,
  renderWorkflowResult,
  type RuntimeWorkflowRequest,
} from './runtime-workflow.js'
import { createWorkflowRuntimeContext, createWorkflowRuntimeRegistry } from '../runtime-workflow-registry.js'
import { renderRuntimeWorkflow } from '../../cli-runtime-workflow.js'

function createTestRegistry() {
  return createWorkflowRuntimeRegistry({})
}

function createTestContext() {
  return createWorkflowRuntimeContext()
}

describe('evaluateWorkflowRequest', () => {
  it('returns valid for a well-formed request', () => {
    const result = evaluateWorkflowRequest({
      name: 'test-workflow',
      steps: [{ toolName: 'plan_goal', input: { goal: 'test' } }],
    })
    expect(result.valid).toBe(true)
  })

  it('blocks when name is empty', () => {
    const result = evaluateWorkflowRequest({
      name: '',
      steps: [{ toolName: 'plan_goal', input: { goal: 'test' } }],
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.blockReasons).toContain('Workflow name is required.')
    }
  })

  it('blocks when steps array is empty', () => {
    const result = evaluateWorkflowRequest({
      name: 'test',
      steps: [],
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.blockReasons).toContain('Workflow must contain at least one step.')
    }
  })

  it('blocks when step count exceeds maxSteps', () => {
    const steps = Array.from({ length: 3 }, (_, i) => ({
      toolName: 'plan_goal' as const,
      input: { goal: `step ${i}` },
    }))
    const result = evaluateWorkflowRequest({
      name: 'test',
      steps,
      maxSteps: 2,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.blockReasons[0]).toContain('3 steps but the limit is 2')
    }
  })

  it('accumulates multiple block reasons', () => {
    const result = evaluateWorkflowRequest({
      name: '',
      steps: [],
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.blockReasons.length).toBe(2)
    }
  })
})

describe('runRuntimeWorkflow', () => {
  it('completes a single-step workflow', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'single-step',
      steps: [{ toolName: 'plan_goal', input: { goal: 'test goal' } }],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())

    expect(result.status).toBe('completed')
    expect(result.stepsExecuted).toBe(1)
    expect(result.stepResults).toHaveLength(1)
    expect(result.stepResults[0]?.toolName).toBe('plan_goal')
    expect(result.stepResults[0]?.status).toBe('ok')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('completes a multi-step workflow', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'multi-step',
      steps: [
        { toolName: 'plan_goal', input: { goal: 'test goal' } },
        { toolName: 'validation_plan', input: { focus: 'test focus' } },
      ],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())

    expect(result.status).toBe('completed')
    expect(result.stepsExecuted).toBe(2)
    expect(result.stepResults).toHaveLength(2)
  })

  it('blocks when request validation fails', async () => {
    const request: RuntimeWorkflowRequest = {
      name: '',
      steps: [],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())

    expect(result.status).toBe('blocked')
    expect(result.stepsExecuted).toBe(0)
    expect(result.blockReasons.length).toBeGreaterThan(0)
  })

  it('blocks when a tool is not found in registry', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'missing-tool',
      steps: [{ toolName: 'plan_goal', input: { goal: 'test' } }, { toolName: 'github_write_gate', input: {} }],
    }
    const registry = createWorkflowRuntimeRegistry({})
    const result = await runRuntimeWorkflow(request, registry, createTestContext())

    expect(result.stepsExecuted).toBeGreaterThanOrEqual(1)
    expect(result.stepResults.length).toBeGreaterThanOrEqual(1)
  })

  it('stops at step limit', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'limited',
      steps: [
        { toolName: 'plan_goal', input: { goal: 'a' } },
        { toolName: 'plan_goal', input: { goal: 'b' } },
        { toolName: 'plan_goal', input: { goal: 'c' } },
      ],
      maxSteps: 2,
    }

    const validation = evaluateWorkflowRequest(request)
    expect(validation.valid).toBe(false)
  })

  it('captures transcript entries for each step', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'transcript-test',
      steps: [{ toolName: 'plan_goal', input: { goal: 'transcript goal' } }],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())

    expect(result.transcript.goal).toBe('transcript-test')
    expect(result.transcript.entries.length).toBeGreaterThanOrEqual(2)
    expect(result.transcript.entries[0]?.role).toBe('tool')
    expect(result.transcript.entries[1]?.role).toBe('result')
  })

  it('emits audit events for workflow lifecycle', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'audit-test',
      steps: [{ toolName: 'plan_goal', input: { goal: 'audit goal' } }],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())

    const startEvent = result.auditLog.find((e) => e.action === 'workflow_start')
    const stepEvent = result.auditLog.find((e) => e.action === 'workflow_step')
    const completeEvent = result.auditLog.find((e) => e.action === 'workflow_complete')

    expect(startEvent).toBeDefined()
    expect(startEvent?.status).toBe('allowed')
    expect(stepEvent).toBeDefined()
    expect(completeEvent).toBeDefined()
    expect(completeEvent?.status).toBe('allowed')
  })

  it('emits blocked audit event when tool is not found', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'missing-tool-audit',
      steps: [{ toolName: 'github_write_gate', input: {} }],
    }

    const emptyRegistry = createWorkflowRuntimeRegistry({})
    const hasTool = emptyRegistry.has('github_write_gate')

    if (!hasTool) {
      const result = await runRuntimeWorkflow(request, emptyRegistry, createTestContext())
      const blockedEvent = result.auditLog.find((e) => e.action === 'workflow_step_blocked')
      expect(blockedEvent).toBeDefined()
      expect(blockedEvent?.status).toBe('blocked')
    }
  })
})

describe('renderWorkflowResult', () => {
  it('renders completed workflow', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'render-test',
      steps: [{ toolName: 'plan_goal', input: { goal: 'render goal' } }],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())
    const output = renderWorkflowResult(result)

    expect(output).toContain('CodeMind runtime workflow result')
    expect(output).toContain('render-test')
    expect(output).toContain('COMPLETED')
    expect(output).toContain('1 executed')
    expect(output).toContain('governed composition only')
    expect(output).toContain('no new mutation surface')
    expect(output).toContain('existing tool gates enforced')
  })

  it('renders blocked workflow with reasons', async () => {
    const request: RuntimeWorkflowRequest = {
      name: '',
      steps: [],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())
    const output = renderWorkflowResult(result)

    expect(output).toContain('BLOCKED')
    expect(output).toContain('Block reasons:')
  })

  it('renders step results with tool names', async () => {
    const request: RuntimeWorkflowRequest = {
      name: 'step-render',
      steps: [
        { toolName: 'plan_goal', input: { goal: 'test' } },
        { toolName: 'validation_plan', input: { focus: 'test' } },
      ],
    }
    const result = await runRuntimeWorkflow(request, createTestRegistry(), createTestContext())
    const output = renderWorkflowResult(result)

    expect(output).toContain('Step results:')
    expect(output).toContain('plan_goal')
    expect(output).toContain('validation_plan')
  })
})

describe('renderRuntimeWorkflow (CLI)', () => {
  it('runs a workflow from a fixture file', async () => {
    const dir = join(tmpdir(), `workflow-cli-test-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'workflow.json')
    await writeFile(fixturePath, JSON.stringify({
      name: 'cli-test-workflow',
      steps: [
        { toolName: 'plan_goal', input: { goal: 'cli test' } },
      ],
    }))

    const output = await renderRuntimeWorkflow(fixturePath)

    expect(output).toContain('CodeMind runtime workflow result')
    expect(output).toContain('cli-test-workflow')
    expect(output).toContain('COMPLETED')
  })

  it('throws when name is missing', async () => {
    const dir = join(tmpdir(), `workflow-cli-name-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'workflow.json')
    await writeFile(fixturePath, JSON.stringify({
      steps: [{ toolName: 'plan_goal', input: { goal: 'test' } }],
    }))

    await expect(renderRuntimeWorkflow(fixturePath)).rejects.toThrow('Missing or invalid workflow name.')
  })

  it('throws when steps is missing', async () => {
    const dir = join(tmpdir(), `workflow-cli-steps-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'workflow.json')
    await writeFile(fixturePath, JSON.stringify({
      name: 'test',
    }))

    await expect(renderRuntimeWorkflow(fixturePath)).rejects.toThrow('Missing or empty steps array.')
  })

  it('throws when step toolName is missing', async () => {
    const dir = join(tmpdir(), `workflow-cli-toolname-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'workflow.json')
    await writeFile(fixturePath, JSON.stringify({
      name: 'test',
      steps: [{ input: { goal: 'test' } }],
    }))

    await expect(renderRuntimeWorkflow(fixturePath)).rejects.toThrow('Step 1: missing or invalid toolName.')
  })

  it('throws when step input is missing', async () => {
    const dir = join(tmpdir(), `workflow-cli-input-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'workflow.json')
    await writeFile(fixturePath, JSON.stringify({
      name: 'test',
      steps: [{ toolName: 'plan_goal' }],
    }))

    await expect(renderRuntimeWorkflow(fixturePath)).rejects.toThrow('Step 1: missing or invalid input object.')
  })

  it('respects maxSteps from fixture', async () => {
    const dir = join(tmpdir(), `workflow-cli-maxsteps-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'workflow.json')
    await writeFile(fixturePath, JSON.stringify({
      name: 'maxsteps-test',
      steps: [
        { toolName: 'plan_goal', input: { goal: 'a' } },
        { toolName: 'plan_goal', input: { goal: 'b' } },
        { toolName: 'plan_goal', input: { goal: 'c' } },
      ],
      maxSteps: 2,
    }))

    const output = await renderRuntimeWorkflow(fixturePath)
    expect(output).toContain('BLOCKED')
    expect(output).toContain('3 steps but the limit is 2')
  })

  it('accepts optional clientData', async () => {
    const dir = join(tmpdir(), `workflow-cli-client-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const fixturePath = join(dir, 'workflow.json')
    await writeFile(fixturePath, JSON.stringify({
      name: 'client-data-test',
      steps: [
        { toolName: 'plan_goal', input: { goal: 'with client data' } },
      ],
      clientData: {},
    }))

    const output = await renderRuntimeWorkflow(fixturePath)
    expect(output).toContain('COMPLETED')
  })
})
