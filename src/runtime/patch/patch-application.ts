import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import type { SandboxFileWriter } from '../sandbox/sandbox-runner.js'
import {
  evaluateLocalFileWriteGate,
  type LocalFileWriteRequest,
} from '../write/local-file-write-gate.js'
import { executeLocalFileWrite } from '../write/local-file-writer.js'
import type { LocalFileWriteExecutionResult } from '../write/local-file-write-result.js'

export type PatchApplicationOutcome = 'APPLIED' | 'DRY_RUN' | 'BLOCKED'

export interface PatchFileChange {
  readonly targetPath: string
  readonly content: string
  readonly reason?: string
  readonly rollbackNote?: string
}

export interface PatchApplicationRequest {
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun: boolean
  readonly files: readonly PatchFileChange[]
}

export interface PatchApplicationResult {
  readonly outcome: PatchApplicationOutcome
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun: boolean
  readonly fileResults: readonly LocalFileWriteExecutionResult[]
  readonly blockReasons: readonly string[]
}

function toWriteRequest(
  request: PatchApplicationRequest,
  file: PatchFileChange,
): LocalFileWriteRequest {
  return {
    targetPath: file.targetPath,
    content: file.content,
    reason: file.reason ?? request.reason,
    rollbackNote: file.rollbackNote ?? request.rollbackNote,
    dryRun: request.dryRun,
  }
}

export function applyStructuredPatch(
  request: PatchApplicationRequest,
  workspaceRoot: string,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
  sandboxFileWriter?: SandboxFileWriter,
): PatchApplicationResult {
  const blockReasons: string[] = []

  if (request.reason.trim().length === 0) {
    blockReasons.push('Patch application request must include a reason.')
  }

  if (request.rollbackNote.trim().length === 0) {
    blockReasons.push('Patch application request must include a rollback note.')
  }

  if (request.files.length === 0) {
    blockReasons.push('Patch application request must include at least one file change.')
  }

  const writeRequests = request.files.map((file) => toWriteRequest(request, file))
  const preflightResults = writeRequests.map((writeRequest) =>
    evaluateLocalFileWriteGate(writeRequest, workspaceRoot, policy, approval),
  )

  for (const result of preflightResults) {
    if (result.decision === 'BLOCKED') {
      blockReasons.push(...result.blockReasons.map((reason) => `${result.targetPath}: ${reason}`))
    }
  }

  if (blockReasons.length > 0) {
    return {
      outcome: 'BLOCKED',
      reason: request.reason,
      rollbackNote: request.rollbackNote,
      dryRun: request.dryRun,
      fileResults: preflightResults.map((gateResult, index) => ({
        outcome: 'BLOCKED' as const,
        gateResult,
        diff: null,
        rollbackNote: writeRequests[index]?.rollbackNote ?? request.rollbackNote,
        error: null,
      })),
      blockReasons,
    }
  }

  const fileResults = writeRequests.map((writeRequest) =>
    executeLocalFileWrite(writeRequest, workspaceRoot, policy, approval, sandboxFileWriter),
  )
  const failedResults = fileResults.filter((result) => result.outcome === 'BLOCKED')

  return {
    outcome: failedResults.length > 0 ? 'BLOCKED' : request.dryRun ? 'DRY_RUN' : 'APPLIED',
    reason: request.reason,
    rollbackNote: request.rollbackNote,
    dryRun: request.dryRun,
    fileResults,
    blockReasons: failedResults.flatMap((result) => result.gateResult.blockReasons),
  }
}

export function renderPatchApplicationResult(result: PatchApplicationResult): string {
  const lines: string[] = [
    'SymbolWright patch application',
    '',
    `Outcome: ${result.outcome}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Rollback: ${result.rollbackNote}`,
    `Files: ${result.fileResults.length}`,
  ]

  if (result.blockReasons.length > 0) {
    lines.push('', 'Block reasons:')
    lines.push(...result.blockReasons.map((reason) => `- ${reason}`))
  }

  lines.push('', 'File results:')
  lines.push(
    ...result.fileResults.map(
      (fileResult) => `- ${fileResult.outcome} ${fileResult.gateResult.targetPath}`,
    ),
  )

  if (result.outcome === 'DRY_RUN') {
    lines.push('', 'Dry-run only. No files have been modified.')
  }

  if (result.outcome === 'APPLIED') {
    lines.push('', 'Structured patch applied through the sandbox runner.')
  }

  return lines.join('\n')
}
