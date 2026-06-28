import fs from 'node:fs'

import {
  evaluateLiveReadPolicy,
  type LiveReadPolicyDecision,
  type LiveReadPolicyRequest,
} from '../policy/live-read-policy.js'

export interface LiveReadPolicyHandshakeResult {
  readonly request: LiveReadPolicyRequest
  readonly decision: LiveReadPolicyDecision
}

export function readLiveReadPolicyRequestFromFile(path: string): LiveReadPolicyRequest {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as LiveReadPolicyRequest
}

export function runLiveReadPolicyHandshake(
  request: LiveReadPolicyRequest,
): LiveReadPolicyHandshakeResult {
  return {
    request,
    decision: evaluateLiveReadPolicy(request),
  }
}

export function renderLiveReadPolicyHandshake(result: LiveReadPolicyHandshakeResult): string {
  return [
    'CodeMind live read policy handshake',
    '',
    `Provider: ${result.request.provider}`,
    `Purpose: ${result.request.purpose}`,
    `Dry run: ${result.request.dryRun ? 'yes' : 'no'}`,
    `Decision: ${result.decision.allowed ? 'ALLOW' : 'BLOCK'}`,
    `Reason: ${result.decision.reason}`,
    '',
    'Requested scopes:',
    ...(result.decision.requestedScopes.length > 0
      ? result.decision.requestedScopes.map((scope) => `- ${scope}`)
      : ['- none']),
    '',
    'Boundary:',
    ...result.decision.requiredBoundary.map((item) => `- ${item}`),
  ].join('\n')
}
