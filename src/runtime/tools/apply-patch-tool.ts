import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  applyStructuredPatch,
  renderPatchApplicationResult,
  type PatchApplicationRequest,
  type PatchFileChange,
} from '../patch/patch-application.js'
import { renderAuditEvents } from '../audit/runtime-audit-log.js'
import { createLocalFileWriteExecutionAuditEvent } from '../write/local-file-write-audit.js'
import { renderLocalFileWriteDiff } from '../write/local-file-write-diff.js'

export interface ApplyPatchToolInput {
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun: boolean
  readonly files: readonly PatchFileChange[]
}

function parsePatchFileChange(input: unknown, index: number): PatchFileChange {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`Patch file ${index + 1} must be an object.`)
  }

  const obj = input as Record<string, unknown>
  const targetPath = obj['targetPath']
  const content = obj['content']
  const reason = obj['reason']
  const rollbackNote = obj['rollbackNote']

  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error(`Patch file ${index + 1} must include targetPath.`)
  }

  if (typeof content !== 'string') {
    throw new Error(`Patch file ${index + 1} must include string content.`)
  }

  return {
    targetPath,
    content,
    ...(typeof reason === 'string' ? { reason } : {}),
    ...(typeof rollbackNote === 'string' ? { rollbackNote } : {}),
  }
}

function parseApplyPatchToolInput(input: unknown): ApplyPatchToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing apply patch input.')
  }

  const obj = input as Record<string, unknown>
  const reason = obj['reason']
  const rollbackNote = obj['rollbackNote']
  const dryRun = obj['dryRun']
  const files = obj['files']

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }

  if (typeof rollbackNote !== 'string' || rollbackNote.trim().length === 0) {
    throw new Error('Missing rollbackNote.')
  }

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Missing files.')
  }

  return {
    reason,
    rollbackNote,
    dryRun: typeof dryRun === 'boolean' ? dryRun : false,
    files: files.map((file, index) => parsePatchFileChange(file, index)),
  }
}

export const applyPatchTool: RuntimeToolDefinition = {
  name: 'apply_patch',
  description: 'Apply a structured patch to workspace files, with dryRun available as explicit preview mode.',
  capability: 'PATCH_APPLICATION',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseApplyPatchToolInput(input)
    const request: PatchApplicationRequest = {
      reason: parsed.reason,
      rollbackNote: parsed.rollbackNote,
      dryRun: parsed.dryRun,
      files: parsed.files,
    }

    const result = applyStructuredPatch(request, context.cwd, context.policy, context.approval)
    const sections: string[] = [renderPatchApplicationResult(result)]

    const diffs = result.fileResults
      .map((fileResult) => fileResult.diff)
      .filter((diff) => diff !== null)

    if (diffs.length > 0) {
      sections.push('', '---', '', 'Patch diff previews')
      sections.push(...diffs.map((diff) => renderLocalFileWriteDiff(diff)))
    }

    const auditEvents = result.fileResults.map((fileResult) =>
      createLocalFileWriteExecutionAuditEvent(fileResult, context.approval),
    )
    sections.push('', '---', '', renderAuditEvents(auditEvents))

    return sections.join('\n')
  },
}
