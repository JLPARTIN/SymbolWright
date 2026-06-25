import fs from 'node:fs'
import path from 'node:path'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  evaluateLocalFileWriteGate,
  type LocalFileWriteRequest,
} from './local-file-write-gate.js'
import { buildLocalFileWriteDiff, type LocalFileWriteDiff } from './local-file-write-diff.js'
import type { LocalFileWriteExecutionResult } from './local-file-write-result.js'

export function executeLocalFileWrite(
  request: LocalFileWriteRequest,
  workspaceRoot: string,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): LocalFileWriteExecutionResult {
  const gateResult = evaluateLocalFileWriteGate(request, workspaceRoot, policy, approval)

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

  try {
    const parentDir = path.dirname(gateResult.resolvedPath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }
    fs.writeFileSync(gateResult.resolvedPath, request.content, 'utf8')
  } catch (err) {
    return {
      outcome: 'BLOCKED',
      gateResult,
      diff,
      rollbackNote: request.rollbackNote,
      error: err instanceof Error ? err.message : String(err),
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
