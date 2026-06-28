import type { CodemindToolName, RuntimeToolContext } from '../types.js'
import type { RuntimeRegistry } from '../registry/runtime-registry.js'
import { appendTranscriptEntry, type RuntimeTranscript } from '../transcript/runtime-transcript.js'
import {
  createAuditEvent,
  RuntimeAuditLog,
  type RuntimeAuditEvent,
} from '../audit/runtime-audit-log.js'

export interface RuntimeWorkflowStep {
  readonly toolName: CodemindToolName
  readonly input: Record<string, unknown>
}

export interface RuntimeWorkflowRequest {
  readonly name: string
  readonly steps: readonly RuntimeWorkflowStep[]
  readonly maxSteps?: number
}

export type RuntimeWorkflowStatus = 'completed' | 'blocked' | 'step_limit'

export interface RuntimeWorkflowResult {
  readonly name: string
  readonly status: RuntimeWorkflowStatus
  readonly stepsExecuted: number
  readonly stepResults: readonly RuntimeWorkflowStepResult[]
  readonly transcript: RuntimeTranscript
  readonly auditLog: readonly RuntimeAuditEvent[]
  readonly blockReasons: readonly string[]
}

export interface RuntimeWorkflowStepResult {
  readonly toolName: CodemindToolName
  readonly output: string
  readonly status: 'ok' | 'error'
}

const DEFAULT_MAX_STEPS = 10

export function evaluateWorkflowRequest(
  request: RuntimeWorkflowRequest,
): { valid: true } | { valid: false; blockReasons: string[] } {
  const blockReasons: string[] = []

  if (request.name.trim().length === 0) {
    blockReasons.push('Workflow name is required.')
  }

  if (request.steps.length === 0) {
    blockReasons.push('Workflow must contain at least one step.')
  }

  const maxSteps = request.maxSteps ?? DEFAULT_MAX_STEPS
  if (request.steps.length > maxSteps) {
    blockReasons.push(`Workflow has ${request.steps.length} steps but the limit is ${maxSteps}.`)
  }

  if (blockReasons.length > 0) {
    return { valid: false, blockReasons }
  }

  return { valid: true }
}

export async function runRuntimeWorkflow(
  request: RuntimeWorkflowRequest,
  registry: RuntimeRegistry,
  context: RuntimeToolContext,
): Promise<RuntimeWorkflowResult> {
  const validation = evaluateWorkflowRequest(request)

  if (!validation.valid) {
    return {
      name: request.name,
      status: 'blocked',
      stepsExecuted: 0,
      stepResults: [],
      transcript: { goal: request.name, entries: [] },
      auditLog: [],
      blockReasons: validation.blockReasons,
    }
  }

  const maxSteps = request.maxSteps ?? DEFAULT_MAX_STEPS
  const audit = new RuntimeAuditLog()
  let transcript: RuntimeTranscript = { goal: request.name, entries: [] }
  const stepResults: RuntimeWorkflowStepResult[] = []
  let stepsExecuted = 0

  audit.record(
    createAuditEvent({
      action: 'workflow_start',
      status: 'allowed',
      detail: `Starting workflow "${request.name}" with ${request.steps.length} steps`,
    }),
  )

  for (const step of request.steps) {
    if (stepsExecuted >= maxSteps) {
      audit.record(
        createAuditEvent({
          action: 'workflow_step_limit',
          status: 'blocked',
          detail: `Workflow "${request.name}" stopped at step limit ${maxSteps}`,
        }),
      )

      return {
        name: request.name,
        status: 'step_limit',
        stepsExecuted,
        stepResults,
        transcript,
        auditLog: audit.list(),
        blockReasons: [`Step limit reached: ${maxSteps}`],
      }
    }

    if (!registry.has(step.toolName)) {
      const reason = `Tool not found in registry: ${step.toolName}`

      audit.record(
        createAuditEvent({
          action: 'workflow_step_blocked',
          status: 'blocked',
          detail: reason,
        }),
      )

      transcript = appendTranscriptEntry(transcript, {
        iteration: stepsExecuted + 1,
        role: 'system',
        message: reason,
      })

      return {
        name: request.name,
        status: 'blocked',
        stepsExecuted,
        stepResults,
        transcript,
        auditLog: audit.list(),
        blockReasons: [reason],
      }
    }

    stepsExecuted += 1

    transcript = appendTranscriptEntry(transcript, {
      iteration: stepsExecuted,
      role: 'tool',
      message: `invoke ${step.toolName}`,
    })

    const tool = registry.getOrThrow(step.toolName)
    let output: string
    let status: 'ok' | 'error'

    try {
      output = await tool.execute(step.input, context)
      status = 'ok'
    } catch (err: unknown) {
      output = err instanceof Error ? err.message : String(err)
      status = 'error'
    }

    const firstLine = output.split('\n')[0] ?? output

    transcript = appendTranscriptEntry(transcript, {
      iteration: stepsExecuted,
      role: 'result',
      message: firstLine,
    })

    audit.record(
      createAuditEvent({
        action: 'workflow_step',
        status: status === 'ok' ? 'allowed' : 'blocked',
        detail: `Step ${stepsExecuted}: ${step.toolName} — ${status}`,
      }),
    )

    stepResults.push({ toolName: step.toolName, output, status })

    if (status === 'error') {
      return {
        name: request.name,
        status: 'blocked',
        stepsExecuted,
        stepResults,
        transcript,
        auditLog: audit.list(),
        blockReasons: [`Step ${stepsExecuted} (${step.toolName}) failed: ${output}`],
      }
    }
  }

  audit.record(
    createAuditEvent({
      action: 'workflow_complete',
      status: 'allowed',
      detail: `Workflow "${request.name}" completed ${stepsExecuted} steps`,
    }),
  )

  return {
    name: request.name,
    status: 'completed',
    stepsExecuted,
    stepResults,
    transcript,
    auditLog: audit.list(),
    blockReasons: [],
  }
}

export function renderWorkflowResult(result: RuntimeWorkflowResult): string {
  const lines = [
    'CodeMind runtime workflow result',
    '',
    `Workflow:  ${result.name}`,
    `Status:   ${result.status.toUpperCase()}`,
    `Steps:    ${result.stepsExecuted} executed`,
    '',
  ]

  if (result.blockReasons.length > 0) {
    lines.push('Block reasons:')
    for (const reason of result.blockReasons) {
      lines.push(`  - ${reason}`)
    }
    lines.push('')
  }

  if (result.stepResults.length > 0) {
    lines.push('Step results:')
    for (let i = 0; i < result.stepResults.length; i++) {
      const step = result.stepResults[i]!
      const firstLine = step.output.split('\n')[0] ?? step.output
      lines.push(`  ${i + 1}. [${step.status.toUpperCase()}] ${step.toolName}: ${firstLine}`)
    }
    lines.push('')
  }

  lines.push('Boundary:')
  lines.push('- governed composition only')
  lines.push('- no new mutation surface')
  lines.push('- existing tool gates enforced')

  return lines.join('\n')
}
