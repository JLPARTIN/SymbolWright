import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  renderValidationExecutorResult,
  runValidationCommand,
} from './validation-command-executor.js'

const shellPolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowShell: true,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const blockedPolicy: RuntimePolicySnapshot = {
  mode: 'READ_ONLY',
  allowNetwork: false,
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

function makeWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-exec-'))
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
  it('returns BLOCKED when shell is disabled', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      blockedPolicy,
      approval,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.exitCode).toBeNull()
    expect(result.recommendedNextAction).toContain('Resolve block reasons')
    expect(result.transcript.blockReasons.length).toBeGreaterThan(0)
  })

  it('returns DRY_RUN when dryRun is true', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      true,
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.outcome).toBe('DRY_RUN')
    expect(result.exitCode).toBeNull()
    expect(result.recommendedNextAction).toContain('Set dryRun=false')
    expect(result.transcript.dryRun).toBe(true)
  })

  it('returns PASS for successful command execution', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.outcome).toBe('PASS')
    expect(result.exitCode).toBe(0)
    expect(result.redactedStdout).toContain('42')
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result.recommendedNextAction).toContain('Proceed to next step')
    expect(result.transcript.recordedAt).toBeTruthy()
  })

  it('returns FAIL for failing command execution', () => {
    const result = runValidationCommand(
      'npm test',
      'Run tests',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.outcome).toBe('FAIL')
    expect(result.exitCode).not.toBe(0)
    expect(result.recommendedNextAction).toContain('Fix issues')
  })

  it('captures elapsed time', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result.transcript.elapsedMs).toBe(result.elapsedMs)
  })

  it('redacts secrets in output', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-exec-redact-'))
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

    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      workspace,
      shellPolicy,
      approval,
    )

    expect(result.redactedStdout).not.toContain('sk-abcdef')
    expect(result.redactedStdout).toContain('[REDACTED]')
  })

  it('blocks commands not in allowlist', () => {
    const result = runValidationCommand(
      'rm -rf /',
      'Evil command',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.transcript.blockReasons.some((r) => r.includes('not allowlisted'))).toBe(true)
  })

  it('blocks without approval', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      undefined,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.transcript.blockReasons.some((r) => r.includes('Approval ticket'))).toBe(true)
  })

  it('blocks with wrong approval scope', () => {
    const wrongApproval: RuntimeApproval = {
      ticketId: 'WRONG-001',
      approvedBy: 'operator',
      scopes: ['file:write'],
    }

    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      wrongApproval,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.transcript.blockReasons.some((r) => r.includes('command:validate'))).toBe(true)
  })

  it('blocks chained commands', () => {
    const result = runValidationCommand(
      'npm run typecheck && rm -rf /',
      'Sneaky chain',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.outcome).toBe('BLOCKED')
  })
})

describe('renderValidationExecutorResult', () => {
  it('renders a PASS result', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      shellPolicy,
      approval,
    )
    const output = renderValidationExecutorResult(result)

    expect(output).toContain('CodeMind Validation Command Executor')
    expect(output).toContain('Outcome: PASS')
    expect(output).toContain('Recommended: Validation passed')
  })

  it('renders a BLOCKED result with reasons', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      false,
      makeWorkspace(),
      blockedPolicy,
      undefined,
    )
    const output = renderValidationExecutorResult(result)

    expect(output).toContain('Outcome: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('Shell execution is disabled')
  })

  it('renders a DRY_RUN result', () => {
    const result = runValidationCommand(
      'npm run typecheck',
      'Check types',
      true,
      makeWorkspace(),
      shellPolicy,
      approval,
    )
    const output = renderValidationExecutorResult(result)

    expect(output).toContain('Outcome: DRY_RUN')
    expect(output).toContain('Exit code: not run')
  })
})
