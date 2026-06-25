import fs from 'node:fs'

import {
  createLocalWriteRuntimeContext,
  createLocalWriteRuntimeRegistry,
} from './runtime/runtime-local-write-registry.js'

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
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as LocalFileWriteFixtureRequest

  if (typeof raw.targetPath !== 'string' || raw.targetPath.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "targetPath" field.')
  }

  if (typeof raw.reason !== 'string' || raw.reason.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "reason" field.')
  }

  const registry = createLocalWriteRuntimeRegistry({})
  const context = createLocalWriteRuntimeContext(cwd)

  const tool = registry.getOrThrow('local_file_write')
  return tool.execute(
    {
      targetPath: raw.targetPath,
      content: raw.content ?? '',
      reason: raw.reason,
      rollbackNote: raw.rollbackNote ?? '',
      dryRun: raw.dryRun ?? true,
    },
    context,
  )
}
