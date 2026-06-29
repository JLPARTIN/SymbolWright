import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createHashEmbeddingProvider } from '../../memory/embedding-provider.js'
import type { SandboxRunner } from '../sandbox/sandbox-runner.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'
import { validationCommandGateTool } from './validation-command-gate-tool.js'

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
  ticketId: 'GATE-TOOL-001',
  approvedBy: 'operator',
  scopes: ['command:validate'],
}

const successfulSandboxRunner: SandboxRunner = {
  runCommand: async (request) => ({
    outcome: 'EXECUTED',
    runner: 'docker',
    command: [request.binary, ...request.args].join(' '),
    stdout: '42\n',
    stderr: '',
    exitCode: 0,
    reason: null,
  }),
}

let tempDir: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-gate-tool-'))
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      scripts: {
        typecheck: 'node -e "console.log(42)"',
      },
    }),
    'utf8',
  )
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function makeContext(
  policy: RuntimePolicySnapshot,
  runtimeApproval?: RuntimeApproval,
): RuntimeToolContext {
  const base = {
    cwd: tempDir,
    policy,
    embeddingProvider: createHashEmbeddingProvider(),
    sandboxRunner: successfulSandboxRunner,
  }
  if (runtimeApproval !== undefined) {
    return { ...base, approval: runtimeApproval }
  }
  return base
}

describe('validationCommandGateTool', () => {
  it('has correct name and capability', () => {
    expect(validationCommandGateTool.name).toBe('validation_command_gate')
    expect(validationCommandGateTool.capability).toBe('VALIDATION_COMMAND')
  })

  it('throws on missing input', async () => {
    await expect(
      validationCommandGateTool.execute(null, makeContext(shellPolicy, approval)),
    ).rejects.toThrow('Missing validation command gate input')
  })

  it('throws on missing command', async () => {
    await expect(
      validationCommandGateTool.execute(
        { reason: 'test', dryRun: true },
        makeContext(shellPolicy, approval),
      ),
    ).rejects.toThrow('Missing command')
  })

  it('throws on empty command string', async () => {
    await expect(
      validationCommandGateTool.execute(
        { command: '  ', reason: 'test', dryRun: true },
        makeContext(shellPolicy, approval),
      ),
    ).rejects.toThrow('Missing command')
  })

  it('throws on missing reason', async () => {
    await expect(
      validationCommandGateTool.execute(
        { command: 'npm run typecheck', dryRun: true },
        makeContext(shellPolicy, approval),
      ),
    ).rejects.toThrow('Missing reason')
  })

  it('defaults dryRun to true when not provided', async () => {
    const output = await validationCommandGateTool.execute(
      { command: 'npm run typecheck', reason: 'test' },
      makeContext(shellPolicy, approval),
    )
    expect(output).toContain('Dry run: yes')
    expect(output).toContain('DRY_RUN')
  })

  it('renders gate result, execution result, and audit log', async () => {
    const output = await validationCommandGateTool.execute(
      { command: 'npm run typecheck', reason: 'type safety', dryRun: true },
      makeContext(shellPolicy, approval),
    )

    expect(output).toContain('CodeMind validation command gate')
    expect(output).toContain('CodeMind validation command execution')
    expect(output).toContain('ALLOWED')
    expect(output).toContain('validation_command')
  })

  it('executes allowed command when dryRun is false', async () => {
    const output = await validationCommandGateTool.execute(
      { command: 'npm run typecheck', reason: 'type safety', dryRun: false },
      makeContext(shellPolicy, approval),
    )

    expect(output).toContain('Outcome: EXECUTED')
    expect(output).toContain('Exit code: 0')
  })

  it('blocks when shell is disabled', async () => {
    const output = await validationCommandGateTool.execute(
      { command: 'npm run typecheck', reason: 'test', dryRun: false },
      makeContext(blockedPolicy, approval),
    )

    expect(output).toContain('BLOCKED')
    expect(output).toContain('Shell execution is disabled')
  })

  it('blocks non-allowlisted commands', async () => {
    const output = await validationCommandGateTool.execute(
      { command: 'rm -rf /', reason: 'evil', dryRun: false },
      makeContext(shellPolicy, approval),
    )

    expect(output).toContain('BLOCKED')
    expect(output).toContain('not allowlisted')
  })

  it('allows without approval when runtime policy allows execution', async () => {
    const output = await validationCommandGateTool.execute(
      { command: 'npm run typecheck', reason: 'test', dryRun: false },
      makeContext(shellPolicy),
    )

    expect(output).toContain('ALLOWED')
    expect(output).toContain('Command is allowed by runtime policy.')
  })

  it('allows wrong approval scope when runtime policy allows execution', async () => {
    const wrongApproval: RuntimeApproval = {
      ticketId: 'WRONG-001',
      approvedBy: 'operator',
      scopes: ['file:write'],
    }
    const output = await validationCommandGateTool.execute(
      { command: 'npm run typecheck', reason: 'test', dryRun: false },
      makeContext(shellPolicy, wrongApproval),
    )

    expect(output).toContain('ALLOWED')
    expect(output).toContain('Command is allowed by runtime policy.')
  })
})
