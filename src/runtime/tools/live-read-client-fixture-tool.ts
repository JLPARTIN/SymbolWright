import fs from 'node:fs'

import {
  readLiveReadClientFixtureFromFile,
  runLiveReadClientFixture,
} from '../live-read/live-read-client-fixture.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface LiveReadClientFixtureToolInput {
  readonly path: string
}

function parseLiveReadClientFixtureToolInput(input: unknown): LiveReadClientFixtureToolInput {
  if (typeof input !== 'object' || input === null || !('path' in input)) {
    throw new Error('Missing JSON fixture path.')
  }

  const fixturePath = (input as { readonly path: unknown }).path
  if (typeof fixturePath !== 'string' || fixturePath.trim().length === 0) {
    throw new Error('Missing JSON fixture path.')
  }

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture file not found: ${fixturePath}`)
  }

  return { path: fixturePath }
}

export async function executeLiveReadClientFixtureTool(
  input: LiveReadClientFixtureToolInput,
  _context: RuntimeToolContext,
): Promise<string> {
  const request = readLiveReadClientFixtureFromFile(input.path)
  return runLiveReadClientFixture(request)
}

export const liveReadClientFixtureTool: RuntimeToolDefinition = {
  name: 'live_read_client_fixture',
  description: 'Run live read client fixture through fake client and evidence pipeline.',
  capability: 'EVIDENCE_READ',
  execute: async (input, context) => executeLiveReadClientFixtureTool(parseLiveReadClientFixtureToolInput(input), context),
}
