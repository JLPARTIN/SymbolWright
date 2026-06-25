import { readFile } from 'node:fs/promises'
import { createWorkflowRuntimeContext, createWorkflowRuntimeRegistry } from './runtime/runtime-workflow-registry.js'
import { runRuntimeWorkflow, renderWorkflowResult } from './runtime/workflow/runtime-workflow.js'
import { buildAjnaWorkflowRequest, renderAjnaWorkflowSummary, type AjnaWorkflowInput } from './runtime/workflow/ajna-workflow-template.js'
import type { FakeLiveReadClientData } from './runtime/live-read/fake-live-read-client.js'

export async function renderRuntimeAjnaWorkflow(fixturePath: string, cwd: string = process.cwd()): Promise<string> {
  const raw = await readFile(fixturePath, 'utf-8')
  const parsed: Record<string, unknown> = JSON.parse(raw) as Record<string, unknown>

  const owner = parsed['owner']
  if (typeof owner !== 'string' || owner.trim().length === 0) {
    throw new Error('Missing or invalid owner.')
  }

  const repo = parsed['repo']
  if (typeof repo !== 'string' || repo.trim().length === 0) {
    throw new Error('Missing or invalid repo.')
  }

  const prNumber = parsed['prNumber']
  if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('Missing or invalid prNumber.')
  }

  const rawMode = parsed['mode']
  if (rawMode !== 'review' && rawMode !== 'merge-readiness' && rawMode !== 'full') {
    throw new Error('Missing or invalid mode. Must be "review", "merge-readiness", or "full".')
  }

  const workflowRunId = typeof parsed['workflowRunId'] === 'number' ? parsed['workflowRunId'] : undefined

  const input: AjnaWorkflowInput = workflowRunId !== undefined
    ? { owner, repo, prNumber, workflowRunId, mode: rawMode }
    : { owner, repo, prNumber, mode: rawMode }

  const rawClientData = parsed['clientData']
  const clientData: FakeLiveReadClientData = typeof rawClientData === 'object' && rawClientData !== null && !Array.isArray(rawClientData)
    ? rawClientData as FakeLiveReadClientData
    : {}

  const request = buildAjnaWorkflowRequest(input)
  const registry = createWorkflowRuntimeRegistry(clientData)
  const context = createWorkflowRuntimeContext(cwd)
  const result = await runRuntimeWorkflow(request, registry, context)

  const summary = renderAjnaWorkflowSummary(input)
  const workflowOutput = renderWorkflowResult(result)

  return [summary, '', workflowOutput].join('\n')
}
