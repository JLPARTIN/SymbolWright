import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { executeValidationCommand, renderValidationCommandExecutionResult } from './validation-command-runner.js'

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
  ticketId: 'VALIDATE-V-001',
  approvedBy: 'operator',
  scopes: ['command:validate'],
}

function makeWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-validation-'))
  fs.writeFileSync(
    path.join(workspace, 'package.json'),
    JSON.stringify({
      scripts: {
        typecheck: 'node -e "console.log(42)"',
      },
    }),
    'utf8',
  )
  return workspace
}

describe('executeValidationCommand', () => {
  it('blocks when shell execution is disabled', () => {
    const result = executeValidationCommand(
      { command: 'npm run typecheck', reason: 'Check fixture', dryRun: false },
      makeWorkspace(),
      blockedPolicy,
      approval,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.exitCode).toBeNull()
    expect(result.gateResult.blockReasons).toContain('Shell execution is disabled by runtime policy.')
  })

  it('dry-runs without executing command', () => {
    const result = executeValidationCommand(
      { command: 'npm run typecheck', reason: 'Check fixture', dryRun: true },
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.outcome).toBe('DRY_RUN')
    expect(result.exitCode).toBeNull()
    expect(result.stdout).toBe('')
  })

  it('executes an approved allowlisted command in a fixture workspace', () => {
    const result = executeValidationCommand(
      { command: 'npm run typecheck', reason: 'Check fixture', dryRun: false },
      makeWorkspace(),
      shellPolicy,
      approval,
    )

    expect(result.outcome).toBe('EXECUTED')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('42')
  })

  it('renders execution output', () => {
    const result = executeValidationCommand(
      { command: 'npm run typecheck', reason: 'Check fixture', dryRun: true },
      makeWorkspace(),
      shellPolicy,
      approval,
    )
    const output = renderValidationCommandExecutionResult(result)

    expect(output).toContain('CodeMind validation command execution')
    expect(output).toContain('Outcome: DRY_RUN')
    expect(output).toContain('Dry-run only. No command has been executed.')
  })
})
