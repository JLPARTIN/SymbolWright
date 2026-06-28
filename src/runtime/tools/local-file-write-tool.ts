import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  evaluateLocalFileWriteGate,
  renderLocalFileWriteGateResult,
  type LocalFileWriteRequest,
} from '../write/local-file-write-gate.js'
import {
  createLocalFileWriteAuditEvent,
  createLocalFileWriteExecutionAuditEvent,
} from '../write/local-file-write-audit.js'
import { renderAuditEvents } from '../audit/runtime-audit-log.js'
import { executeLocalFileWrite } from '../write/local-file-writer.js'
import { renderLocalFileWriteExecutionResult } from '../write/local-file-write-result.js'
import { renderLocalFileWriteDiff } from '../write/local-file-write-diff.js'

export interface LocalFileWriteToolInput {
  readonly targetPath: string
  readonly content: string
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun: boolean
}

function parseLocalFileWriteToolInput(input: unknown): LocalFileWriteToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing local file write input.')
  }

  const obj = input as Record<string, unknown>
  const targetPath = obj['targetPath']
  const content = obj['content']
  const reason = obj['reason']
  const rollbackNote = obj['rollbackNote']
  const dryRun = obj['dryRun']

  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error('Missing targetPath.')
  }
  if (typeof content !== 'string') {
    throw new Error('Missing content.')
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }
  if (typeof rollbackNote !== 'string' || rollbackNote.trim().length === 0) {
    throw new Error('Missing rollbackNote.')
  }

  return {
    targetPath,
    content,
    reason,
    rollbackNote,
    dryRun: typeof dryRun === 'boolean' ? dryRun : true,
  }
}

export const localFileWriteTool: RuntimeToolDefinition = {
  name: 'local_file_write',
  description: 'Execute a controlled local file write through the approval-gated write gate.',
  capability: 'LOCAL_FILE_WRITE',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseLocalFileWriteToolInput(input)

    const request: LocalFileWriteRequest = {
      targetPath: parsed.targetPath,
      content: parsed.content,
      reason: parsed.reason,
      rollbackNote: parsed.rollbackNote,
      dryRun: parsed.dryRun,
    }

    if (!context.policy.allowWrites || parsed.dryRun) {
      const gateResult = evaluateLocalFileWriteGate(
        request,
        context.cwd,
        context.policy,
        context.approval,
      )
      const gateOutput = renderLocalFileWriteGateResult(gateResult)
      const auditEvent = createLocalFileWriteAuditEvent(gateResult, context.approval)
      const auditOutput = renderAuditEvents([auditEvent])
      return [gateOutput, '', '---', '', auditOutput].join('\n')
    }

    const execResult = executeLocalFileWrite(request, context.cwd, context.policy, context.approval)
    const execOutput = renderLocalFileWriteExecutionResult(execResult)
    const auditEvent = createLocalFileWriteExecutionAuditEvent(execResult, context.approval)
    const sections: string[] = [execOutput]

    if (execResult.diff !== null) {
      sections.push('', '---', '', renderLocalFileWriteDiff(execResult.diff))
    }

    sections.push('', '---', '', renderAuditEvents([auditEvent]))

    return sections.join('\n')
  },
}
