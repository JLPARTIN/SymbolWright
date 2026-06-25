import type { RuntimeWorkflowRequest, RuntimeWorkflowStep } from './runtime-workflow.js'

export interface AjnaWorkflowInput {
  readonly owner: string
  readonly repo: string
  readonly prNumber: number
  readonly workflowRunId?: number
  readonly mode: 'review' | 'merge-readiness' | 'full'
}

export function buildAjnaWorkflowRequest(input: AjnaWorkflowInput): RuntimeWorkflowRequest {
  const steps: RuntimeWorkflowStep[] = []

  const prReadStep: RuntimeWorkflowStep = {
    toolName: 'github_live_read_pr',
    input: { owner: input.owner, repo: input.repo, prNumber: input.prNumber },
  }
  steps.push(prReadStep)

  if (input.workflowRunId !== undefined) {
    const ciReadStep: RuntimeWorkflowStep = {
      toolName: 'github_live_read_ci',
      input: { owner: input.owner, repo: input.repo, workflowRunId: input.workflowRunId },
    }
    steps.push(ciReadStep)
  }

  if (input.mode === 'review' || input.mode === 'full') {
    const reviewInput: Record<string, unknown> = { owner: input.owner, repo: input.repo, prNumber: input.prNumber }
    if (input.workflowRunId !== undefined) {
      reviewInput['workflowRunId'] = input.workflowRunId
    }
    steps.push({
      toolName: 'ajna_live_read_review',
      input: reviewInput,
    })
  }

  if (input.mode === 'merge-readiness' || input.mode === 'full') {
    const mergeInput: Record<string, unknown> = { owner: input.owner, repo: input.repo, prNumber: input.prNumber }
    if (input.workflowRunId !== undefined) {
      mergeInput['workflowRunId'] = input.workflowRunId
    }
    steps.push({
      toolName: 'ajna_live_read_merge_readiness',
      input: mergeInput,
    })
  }

  return {
    name: `ajna-${input.mode}-${input.owner}-${input.repo}-${input.prNumber}`,
    steps,
    maxSteps: 10,
  }
}

export function renderAjnaWorkflowSummary(input: AjnaWorkflowInput): string {
  const modeName = input.mode === 'full' ? 'review + merge-readiness' : input.mode
  const lines = [
    'Ajna workflow template',
    '',
    `Mode:       ${modeName}`,
    `Repository: ${input.owner}/${input.repo}`,
    `PR:         #${input.prNumber}`,
  ]

  if (input.workflowRunId !== undefined) {
    lines.push(`Workflow:   ${input.workflowRunId}`)
  }

  return lines.join('\n')
}
