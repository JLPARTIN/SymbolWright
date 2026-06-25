import fs from 'node:fs'
import path from 'node:path'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  evaluateLocalFileWriteGate,
  type LocalFileWriteGateResult,
  type LocalFileWriteRequest,
} from './local-file-write-gate.js'

export type LocalFileWriteExecutionStatus =
  | 'blocked'
  | 'dry_run'
  | 'applied'

export interface LocalFileWriteDiffLine {
  readonly marker: ' ' | '-' | '+'
  readonly text: string
}

export interface LocalFileWriteExecutionResult {
  readonly status: LocalFileWriteExecutionStatus
  readonly gate: LocalFileWriteGateResult
  readonly existedBefore: boolean
  readonly previousContent?: string
  readonly nextContent: string
  readonly diff: readonly LocalFileWriteDiffLine[]
  readonly bytesWritten: number
}

function splitLines(content: string): readonly string[] {
  return content.length === 0 ? [] : content.split('\n')
}

export function createLocalFileWriteDiff(
  previousContent: string | undefined,
  nextContent: string,
): readonly LocalFileWriteDiffLine[] {
  const beforeLines = splitLines(previousContent ?? '')
  const afterLines = splitLines(nextContent)

  if (previousContent === nextContent) {
    return afterLines.map((line) => ({ marker: ' ' as const, text: line }))
  }

  return [
    ...beforeLines.map((line) => ({ marker: '-' as const, text: line })),
    ...afterLines.map((line) => ({ marker: '+' as const, text: line })),
  ]
}

export function renderLocalFileWriteDiff(diff: readonly LocalFileWriteDiffLine[]): string {
  if (diff.length === 0) {
    return 'Diff preview:\n- empty file -> empty file'
  }

  return ['Diff preview:', ...diff.map((line) => `${line.marker}${line.text}`)].join('\n')
}

export function executeApprovedLocalFileWrite(
  request: LocalFileWriteRequest,
  workspaceRoot: string,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): LocalFileWriteExecutionResult {
  const gate = evaluateLocalFileWriteGate(request, workspaceRoot, policy, approval)
  const existedBefore = gate.decision === 'ALLOWED' && fs.existsSync(gate.resolvedPath)
  const previousContent = existedBefore ? fs.readFileSync(gate.resolvedPath, 'utf8') : undefined
  const diff = createLocalFileWriteDiff(previousContent, request.content)

  if (gate.decision === 'BLOCKED') {
    return {
      status: 'blocked',
      gate,
      existedBefore,
      nextContent: request.content,
      diff,
      bytesWritten: 0,
    }
  }

  if (request.dryRun) {
    const result: LocalFileWriteExecutionResult = {
      status: 'dry_run',
      gate,
      existedBefore,
      nextContent: request.content,
      diff,
      bytesWritten: 0,
    }

    return previousContent === undefined ? result : { ...result, previousContent }
  }

  fs.mkdirSync(path.dirname(gate.resolvedPath), { recursive: true })
  fs.writeFileSync(gate.resolvedPath, request.content, 'utf8')

  const applied: LocalFileWriteExecutionResult = {
    status: 'applied',
    gate,
    existedBefore,
    nextContent: request.content,
    diff,
    bytesWritten: Buffer.byteLength(request.content, 'utf8'),
  }

  return previousContent === undefined ? applied : { ...applied, previousContent }
}

export function renderLocalFileWriteExecutionResult(result: LocalFileWriteExecutionResult): string {
  const sections = [
    'CodeMind local file write execution',
    '',
    `Status: ${result.status.toUpperCase()}`,
    `Target: ${result.gate.targetPath}`,
    `Resolved path: ${result.gate.resolvedPath}`,
    `Existed before: ${result.existedBefore ? 'yes' : 'no'}`,
    `Bytes written: ${result.bytesWritten}`,
    `Rollback: ${result.gate.rollbackNote}`,
    '',
    renderLocalFileWriteDiff(result.diff),
  ]

  if (result.status === 'blocked') {
    sections.push('', 'Execution blocked. No file has been modified.')
  }

  if (result.status === 'dry_run') {
    sections.push('', 'Dry-run only. No file has been modified.')
  }

  if (result.status === 'applied') {
    sections.push('', 'Approved local file write applied.')
  }

  return sections.join('\n')
}
