import fs from 'node:fs'

import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export interface ValidationCommandFixtureRequest {
  readonly command: string
  readonly reason: string
  readonly dryRun?: boolean
}

export async function renderRuntimeValidationCommand(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as ValidationCommandFixtureRequest

  if (typeof raw.command !== 'string' || raw.command.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "command" field.')
  }

  if (typeof raw.reason !== 'string' || raw.reason.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "reason" field.')
  }

  const registry = createFixtureRegistry('validation_command')
  const context = createFixtureContext(cwd)

  const tool = registry.getOrThrow('validation_command_gate')
  return tool.execute(
    {
      command: raw.command,
      reason: raw.reason,
      dryRun: raw.dryRun ?? true,
    },
    context,
  )
}
