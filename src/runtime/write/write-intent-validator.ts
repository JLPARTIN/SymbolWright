import path from 'node:path'

import { DEFAULT_RUNTIME_PROTECTED_PATHS } from '../policy/runtime-policy.js'
import type { WriteIntent } from './write-intent.js'

export interface WriteIntentValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export function validateWriteIntent(intent: WriteIntent, workspaceRoot: string): WriteIntentValidationResult {
  const errors: string[] = []

  if (intent.id.trim().length === 0) {
    errors.push('Write intent must have a non-empty id.')
  }

  if (intent.targetPath.trim().length === 0) {
    errors.push('Write intent must specify a target path.')
  }

  if (intent.reason.trim().length === 0) {
    errors.push('Write intent must include a reason.')
  }

  if (intent.expectedDiffSummary.trim().length === 0) {
    errors.push('Write intent must include an expected diff summary.')
  }

  if (intent.rollbackNote.trim().length === 0) {
    errors.push('Write intent must include a rollback note.')
  }

  if (intent.validationPlan.length === 0) {
    errors.push('Write intent must include at least one validation step.')
  }

  if (!intent.approvalTicketRequired) {
    errors.push('Write intent must require an approval ticket.')
  }

  if (intent.targetPath.trim().length > 0) {
    const resolved = path.resolve(workspaceRoot, intent.targetPath)
    const root = path.resolve(workspaceRoot)
    const relative = path.relative(root, resolved)

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push(`Target path is outside workspace: ${intent.targetPath}`)
    }

    const segments = relative.split(path.sep).filter(Boolean)
    const basename = path.basename(resolved)

    for (const protectedPath of DEFAULT_RUNTIME_PROTECTED_PATHS) {
      if (segments.includes(protectedPath) || basename === protectedPath) {
        errors.push(`Target path is protected: ${protectedPath}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function renderWriteIntentValidation(result: WriteIntentValidationResult): string {
  if (result.valid) {
    return 'Write intent validation: PASS'
  }

  const lines = ['Write intent validation: FAIL', '']
  lines.push(...result.errors.map((error) => `- ${error}`))
  return lines.join('\n')
}
