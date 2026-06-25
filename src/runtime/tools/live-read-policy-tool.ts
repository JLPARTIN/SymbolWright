import fs from 'node:fs'

import {
  readLiveReadPolicyRequestFromFile,
  renderLiveReadPolicyHandshake,
  runLiveReadPolicyHandshake,
} from '../adapters/live-read-policy-handshake.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface LiveReadPolicyToolInput {
  readonly path: string
}

function parseLiveReadPolicyToolInput(input: unknown): LiveReadPolicyToolInput {
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

export async function executeLiveReadPolicyTool(
  input: LiveReadPolicyToolInput,
  _context: RuntimeToolContext,
): Promise<string> {
  const request = readLiveReadPolicyRequestFromFile(input.path)
  const result = runLiveReadPolicyHandshake(request)
  return renderLiveReadPolicyHandshake(result)
}

export const liveReadPolicyHandshakeTool: RuntimeToolDefinition = {
  name: 'live_read_policy_handshake',
  description: 'Evaluate live read policy handshake from a local JSON fixture without performing live reads.',
  capability: 'POLICY_CHECK',
  execute: async (input, context) => executeLiveReadPolicyTool(parseLiveReadPolicyToolInput(input), context),
}
