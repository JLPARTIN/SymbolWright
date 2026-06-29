import fs from 'node:fs'

import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'
import type { SandboxFileWriter } from './runtime/sandbox/sandbox-runner.js'
import type { RuntimeApproval } from './runtime/types.js'

export interface LocalFileWriteFixtureRequest {
  readonly targetPath: string
  readonly content: string
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun?: boolean
}

export async function renderRuntimeLocalWrite(
  fixturePath: string,
  cwd: string = process.cwd(),
  sandboxFileWriter?: SandboxFileWriter,
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as LocalFileWriteFixtureRequest

  if (typeof raw.targetPath !== 'string' || raw.targetPath.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "targetPath" field.')
  }

  if (typeof raw.reason !== 'string' || raw.reason.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "reason" field.')
  }

  const registry = createFixtureRegistry('local_write')
  const context = createFixtureContext(cwd)
  const approval: RuntimeApproval = {
    ticketId: 'local-write-fixture',
    approvedBy: 'fixture',
    scopes: ['file:write'],
  }

  const tool = registry.getOrThrow('local_file_write')
  return tool.execute(
    {
      targetPath: raw.targetPath,
      content: raw.content ?? '',
      reason: raw.reason,
      rollbackNote: raw.rollbackNote ?? '',
      dryRun: raw.dryRun ?? false,
    },
    { ...context, approval, ...(sandboxFileWriter !== undefined ? { sandboxFileWriter } : {}) },
  )
}
