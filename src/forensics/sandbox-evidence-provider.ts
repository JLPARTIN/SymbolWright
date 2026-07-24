import { DockerSandboxRunner, type SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { createCommandResult, renderScriptCommand } from './command-evidence.js'
import type { ScriptEvidenceProvider } from './command-evidence.js'
import type { CommandResult } from './types.js'

const LONG_RUNNING_SCRIPT_TIMEOUT_MS = 300_000
const LONG_RUNNING_SCRIPTS = new Set(['test', 'test:coverage', 'validate', 'release-readiness'])

function resolveScriptTimeoutMs(script: string): number | undefined {
  return LONG_RUNNING_SCRIPTS.has(script) ? LONG_RUNNING_SCRIPT_TIMEOUT_MS : undefined
}

/**
 * Binds preflight command evidence collection to the zero-trust sandbox runner instead of a
 * raw shell call. The sandbox only allows the "npm" binary, so pnpm/yarn scripts are reported
 * as blocked rather than silently attempted outside the sandbox boundary.
 */
export function createSandboxScriptEvidenceProvider(
  sandboxRunner: SandboxRunner = new DockerSandboxRunner(),
): ScriptEvidenceProvider {
  return async (request): Promise<CommandResult> => {
    if (request.packageManager !== 'npm') {
      return createCommandResult(
        request.packageManager,
        request.script,
        'blocked',
        `Sandbox runner only supports the "npm" binary; "${request.packageManager}" scripts cannot be sandboxed.`,
      )
    }

    const startedAt = Date.now()
    const result = await sandboxRunner.runCommand({
      binary: 'npm',
      args: ['run', request.script],
      workspaceRoot: request.repoRoot,
      timeoutMs: resolveScriptTimeoutMs(request.script),
    })
    const durationMs = Date.now() - startedAt

    if (result.outcome === 'BLOCKED') {
      return {
        script: request.script,
        command: renderScriptCommand(request.packageManager, request.script),
        packageManager: request.packageManager,
        status: 'blocked',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
        reason: result.reason ?? 'Sandbox runner blocked execution.',
      }
    }

    return {
      script: request.script,
      command: renderScriptCommand(request.packageManager, request.script),
      packageManager: request.packageManager,
      status: result.exitCode === 0 ? 'passed' : 'failed',
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
    }
  }
}
