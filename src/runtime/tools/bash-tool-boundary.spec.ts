import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TIMEOUT_MS,
  type SandboxCommandRequest,
  type SandboxRunner,
} from '../sandbox/sandbox-runner.js'
import { executeBashTool } from './bash-tool.js'

function capturingRunner(captured: SandboxCommandRequest[]): SandboxRunner {
  return {
    runCommand: async (request) => {
      captured.push(request)
      return {
        outcome: 'EXECUTED',
        runner: 'docker',
        command: [request.binary, ...request.args].join(' '),
        stdout: '',
        stderr: '',
        exitCode: 0,
        reason: null,
      }
    },
  }
}

describe('bash tool boundary hardening', () => {
  it('caps caller timeout overrides at the server maximum', async () => {
    const captured: SandboxCommandRequest[] = []
    await executeBashTool(
      { command: 'node --version', timeoutMs: DEFAULT_TIMEOUT_MS * 10 },
      process.cwd(),
      true,
      capturingRunner(captured),
    )
    expect(captured[0]?.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
  })

  it('drops invalid timeout overrides instead of widening execution', async () => {
    const captured: SandboxCommandRequest[] = []
    await executeBashTool(
      { command: 'node --version', timeoutMs: -1 },
      process.cwd(),
      true,
      capturingRunner(captured),
    )
    expect(captured[0]?.timeoutMs).toBeUndefined()
  })
})
