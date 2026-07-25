import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { SandboxRunner } from '../sandbox/sandbox-runner.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  renderValidationExecutorResult,
  runValidationCommand,
} from './validation-command-executor.js'

const shellPolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowReadOnlyNetwork: true,
  allowShell: true,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const blockedPolicy: RuntimePolicySnapshot = {
  mode: 'READ_ONLY',
  allowNetwork: false,
  allowReadOnlyNetwork: true,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const approval: RuntimeApproval = {
  ticketId: 'EXEC-001',
  approvedBy: 'operator',
  scopes: ['command:validate'],
}

const sandboxRunner: SandboxRunner = {
  runCommand: async (request) => {
    const command = [request.binary, ...request.args].join(' ')
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(request.workspaceRoot, 'package.json'), 'utf8'),
    ) as { readonly scripts?: Record<string, string> }

    if (command === 'npm test') {
      return {
        outcome: 'EXECUTED',
        runner: 'docker',
        command,
        stdout: '',
        stderr: 'test failed',
        exitCode: 1,
        reason: null,
      }
    }

    const typecheckScript = packageJson.scripts?.['typecheck'] ?? ''
    const stdout = typecheckScript.includes('api_key')
      ? 'api_key: sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef12345678\n'
      : '42\n'

    return {
      outcome: 'EXECUTED',
      runner: 'docker',
      command,
      stdout,
      stderr: '',
      exitCode: 0,
      reason: null,
    }
  },
}

function makeWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-exec-'))
  fs.writeFileSync(
    path.join(workspace, 'package.json'),
    JSON.stringify({
      scripts: {
        typecheck: 'node -e "console.log(42)"',
        test: 'node -e "process.exit(1)"',
      },
    }),
    'utf8',
  )
  return workspace
}

describe('runValidationCommand', () => {
  it('returns BLOCKED when shell is disabled', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      blockedPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.exitCode).toBeNull()
    expect(result.recommendedNextAction).toContain('Resolve block reasons')
    expect(result.transcript.blockReasons.length).toBeGreaterThan(0)
  })

  it('returns DRY_RUN when dryRun is true', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      true,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.outcome).toBe('DRY_RUN')
    expect(result.exitCode).toBeNull()
    expect(result.recommendedNextAction).toContain('Set dryRun=false')
    expect(result.transcript.dryRun).toBe(true)
  })

  it('returns PASS for successful command execution', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.outcome).toBe('PASS')
    expect(result.exitCode).toBe(0)
    expect(result.redactedStdout).toContain('42')
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result.recommendedNextAction).toContain('Proceed to next step')
    expect(result.transcript.recordedAt).toBeTruthy()
  })

  it('returns FAIL for failing command execution', async () => {
    const result = await runValidationCommand(
      'npm test',
      'Run tests',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.outcome).toBe('FAIL')
    expect(result.exitCode).not.toBe(0)
    expect(result.recommendedNextAction).toContain('Fix issues')
  })

  it('captures elapsed time', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result.transcript.elapsedMs).toBe(result.elapsedMs)
  })

  it('redacts secrets in output', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-exec-redact-'))
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        scripts: {
          typecheck:
            'node -e "console.log(\'api_key: sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef12345678\')"',
        },
      }),
      'utf8',
    )

    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      workspace,
      shellPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.redactedStdout).not.toContain('sk-abcdef')
    expect(result.redactedStdout).toContain('[REDACTED]')
  })

  it('blocks commands not in allowlist', async () => {
    const result = await runValidationCommand(
      'rm -rf /',
      'Evil command',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.transcript.blockReasons.some((r) => r.includes('not allowlisted'))).toBe(true)
  })

  it('runs without approval when runtime policy allows execution', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      undefined,
      sandboxRunner,
    )

    expect(result.outcome).toBe('PASS')
    expect(result.transcript.blockReasons.some((r) => r.includes('Approval ticket'))).toBe(false)
  })

  it('runs with wrong approval scope when runtime policy allows execution', async () => {
    const wrongApproval: RuntimeApproval = {
      ticketId: 'WRONG-001',
      approvedBy: 'operator',
      scopes: ['file:write'],
    }

    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      wrongApproval,
      sandboxRunner,
    )

    expect(result.outcome).toBe('PASS')
    expect(result.transcript.blockReasons.some((r) => r.includes('command:validate'))).toBe(false)
  })

  it('blocks chained commands', async () => {
    const result = await runValidationCommand(
      'npm run typecheck && rm -rf /',
      'Sneaky chain',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )

    expect(result.outcome).toBe('BLOCKED')
  })
})

describe('renderValidationExecutorResult', () => {
  it('renders a PASS result', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )
    const output = renderValidationExecutorResult(result)

    expect(output).toContain('SymbolWright Validation Command Executor')
    expect(output).toContain('Outcome: PASS')
    expect(output).toContain('Recommended: Validation passed')
  })

  it('renders a BLOCKED result with reasons', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      blockedPolicy,
      undefined,
      sandboxRunner,
    )
    const output = renderValidationExecutorResult(result)

    expect(output).toContain('Outcome: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('Shell execution is disabled')
  })

  it('renders a DRY_RUN result', async () => {
    const result = await runValidationCommand(
      'npm run typecheck',
      'Check types',
      true,
      makeWorkspace(),
      shellPolicy,
      approval,
      sandboxRunner,
    )
    const output = renderValidationExecutorResult(result)

    expect(output).toContain('Outcome: DRY_RUN')
    expect(output).toContain('Exit code: not run')
  })
})
