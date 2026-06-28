import fs from 'node:fs'

import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from './runtime/types.js'

export interface ApplyPatchFixtureRequest {
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun?: boolean
  readonly files: readonly {
    readonly targetPath: string
    readonly content: string
    readonly reason?: string
    readonly rollbackNote?: string
  }[]
  readonly policy?: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
}

export async function renderRuntimeApplyPatch(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as ApplyPatchFixtureRequest

  if (typeof raw.reason !== 'string' || raw.reason.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "reason" field.')
  }

  if (typeof raw.rollbackNote !== 'string' || raw.rollbackNote.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "rollbackNote" field.')
  }

  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new Error('Fixture must include a non-empty "files" array.')
  }

  const registry = createFixtureRegistry('patch_application')
  const defaultContext = createFixtureContext(cwd)
  const context = {
    ...defaultContext,
    ...(raw.policy !== undefined ? { policy: raw.policy } : {}),
    ...(raw.approval !== undefined ? { approval: raw.approval } : {}),
  }

  const tool = registry.getOrThrow('apply_patch')
  return tool.execute(
    {
      reason: raw.reason,
      rollbackNote: raw.rollbackNote,
      dryRun: raw.dryRun ?? true,
      files: raw.files,
    },
    context,
  )
}
