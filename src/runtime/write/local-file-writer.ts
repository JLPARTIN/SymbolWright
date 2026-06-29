import fs from 'node:fs'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  DockerSandboxFileWriter,
  type SandboxFileWriter,
} from '../sandbox/sandbox-runner.js'
import { evaluateLocalFileWriteGate, type LocalFileWriteRequest } from './local-file-write-gate.js'
import { buildLocalFileWriteDiff, type LocalFileWriteDiff } from './local-file-write-diff.js'
import type { LocalFileWriteExecutionResult } from './local-file-write-result.js'

export function executeLocalFileWrite(
  request: LocalFileWriteRequest,
  workspaceRoot: string,
  policy: RuntimePolicySnapshot,
  approval?: RuntimeApproval,
  sandboxFileWriter: SandboxFileWriter = new DockerSandboxFileWriter(),
): LocalFileWriteExecutionResult {
  void approval

  const gateResult = evaluateLocalFileWriteGate(request, workspaceRoot, policy)

  if (gateResult.decision === 'BLOCKED') {
    return {
      outcome: 'BLOCKED',
      gateResult,
      diff: null,
      rollbackNote: request.rollbackNote,
      error: null,
    }
  }

  if (gateResult.dryRun) {
    let diff: LocalFileWriteDiff | null = null
    try {
      const previousContent = fs.existsSync(gateResult.resolvedPath)
        ? fs.readFileSync(gateResult.resolvedPath, 'utf8')
        : null
      diff = buildLocalFileWriteDiff(gateResult.targetPath, previousContent, request.content)
    } catch {
      diff = buildLocalFileWriteDiff(gateResult.targetPath, null, request.content)
    }

    return {
      outcome: 'DRY_RUN',
      gateResult,
      diff,
      rollbackNote: request.rollbackNote,
      error: null,
    }
  }

  let previousContent: string | null = null
  try {
    previousContent = fs.existsSync(gateResult.resolvedPath)
      ? fs.readFileSync(gateResult.resolvedPath, 'utf8')
      : null
  } catch {
    previousContent = null
  }

  const diff = buildLocalFileWriteDiff(gateResult.targetPath, previousContent, request.content)
  const writeResult = sandboxFileWriter.writeFile({
    workspaceRoot,
    targetPath: request.targetPath,
    content: request.content,
  })

  if (writeResult.outcome === 'BLOCKED') {
    return {
      outcome: 'BLOCKED',
      gateResult,
      diff,
      rollbackNote: request.rollbackNote,
      error: writeResult.reason ?? 'Sandbox file writer blocked the write.',
    }
  }

  return {
    outcome: 'WRITTEN',
    gateResult,
    diff,
    rollbackNote: request.rollbackNote,
    error: null,
  }
}
