import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ALLOWLISTED_VALIDATION_COMMANDS,
  evaluateValidationCommandGate,
  renderValidationCommandGateResult,
  type ValidationCommandRequest,
} from './validation-command-gate.js'
import { createValidationCommandAuditEvent } from './validation-command-audit.js'
import { validationCommandGateTool } from '../tools/validation-command-gate-tool.js'
import { createValidationCommandRuntimeRegistry } from '../runtime-validation-command-registry.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'
import { renderRuntimeValidationCommand } from '../../cli-runtime-validation-command.js'

const shellPolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowShell: true,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const readOnlyPolicy: RuntimePolicySnapshot = {
  mode: 'READ_ONLY',
  allowNetwork: false,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const validApproval: RuntimeApproval = {
  ticketId: 'CMD-TICKET-001',
  approvedBy: 'operator',
  scopes: ['command:validate'],
}

const wrongScopeApproval: RuntimeApproval = {
  ticketId: 'CMD-TICKET-002',
  approvedBy: 'operator',
  scopes: ['file:write'],
}

function makeRequest(overrides: Partial<ValidationCommandRequest> = {}): ValidationCommandRequest {
  return {
    command: overrides.command ?? 'npm run typecheck',
    reason: overrides.reason ?? 'Verify types after edit',
    dryRun: overrides.dryRun ?? true,
  }
}

const testContext: RuntimeToolContext = {
  cwd: '/test/workspace',
  policy: readOnlyPolicy,
}

describe('validation command gate', () => {
  it('allows command with valid policy and approval', () => {
    const request = makeRequest()
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)

    expect(result.decision).toBe('ALLOWED')
    expect(result.blockReasons).toHaveLength(0)
    expect(result.command).toBe('npm run typecheck')
    expect(result.dryRun).toBe(true)
  })

  it('blocks when shell is disabled by policy', () => {
    const request = makeRequest()
    const result = evaluateValidationCommandGate(request, readOnlyPolicy, validApproval)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Shell execution is disabled by runtime policy.')
  })

  it('blocks when approval is undefined', () => {
    const request = makeRequest()
    const result = evaluateValidationCommandGate(request, shellPolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Approval ticket is required for validation commands.')
  })

  it('blocks when approval is missing command:validate scope', () => {
    const request = makeRequest()
    const result = evaluateValidationCommandGate(request, shellPolicy, wrongScopeApproval)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Approval ticket is missing required scope: command:validate')
  })

  it('blocks when command is empty', () => {
    const request = makeRequest({ command: '' })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Validation command must not be empty.')
  })

  it('blocks when command is not allowlisted', () => {
    const request = makeRequest({ command: 'rm -rf /' })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('not allowlisted'))).toBe(true)
  })

  it('blocks when reason is empty', () => {
    const request = makeRequest({ reason: '' })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Validation command request must include a reason.')
  })

  it('accumulates multiple block reasons', () => {
    const request = makeRequest({ command: 'dangerous-cmd', reason: '' })
    const result = evaluateValidationCommandGate(request, readOnlyPolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.length).toBeGreaterThanOrEqual(3)
  })

  it('allows all allowlisted commands', () => {
    for (const cmd of ALLOWLISTED_VALIDATION_COMMANDS) {
      const request = makeRequest({ command: cmd })
      const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)

      expect(result.decision).toBe('ALLOWED')
    }
  })

  it('preserves reason in result', () => {
    const request = makeRequest({ reason: 'Check types' })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)

    expect(result.reason).toBe('Check types')
  })

  it('includes npm run build:app in allowlist', () => {
    expect(ALLOWLISTED_VALIDATION_COMMANDS).toContain('npm run build:app')
  })
})

describe('validation command gate renderer', () => {
  it('renders allowed result with dry-run', () => {
    const request = makeRequest({ dryRun: true })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)
    const output = renderValidationCommandGateResult(result)

    expect(output).toContain('CodeMind validation command gate')
    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry run: yes')
    expect(output).toContain('Dry-run preview: command would be allowed.')
    expect(output).toContain('No command has been executed.')
  })

  it('renders allowed result without dry-run', () => {
    const request = makeRequest({ dryRun: false })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)
    const output = renderValidationCommandGateResult(result)

    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry run: no')
    expect(output).toContain('Command is allowed by policy and approval.')
    expect(output).toContain('No command is executed by this tool.')
  })

  it('renders blocked result with block reasons', () => {
    const request = makeRequest()
    const result = evaluateValidationCommandGate(request, readOnlyPolicy, undefined)
    const output = renderValidationCommandGateResult(result)

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('- Shell execution is disabled by runtime policy.')
    expect(output).toContain('- Approval ticket is required for validation commands.')
  })

  it('renders command and reason', () => {
    const request = makeRequest({ command: 'npm test', reason: 'Run tests' })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)
    const output = renderValidationCommandGateResult(result)

    expect(output).toContain('Command: npm test')
    expect(output).toContain('Reason: Run tests')
  })
})

describe('validation command audit', () => {
  it('creates allowed audit event', () => {
    const request = makeRequest({ dryRun: false })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)
    const event = createValidationCommandAuditEvent(result, validApproval)

    expect(event.action).toBe('validation_command')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('"npm run typecheck" allowed')
  })

  it('creates dry-run audit event', () => {
    const request = makeRequest({ dryRun: true })
    const result = evaluateValidationCommandGate(request, shellPolicy, validApproval)
    const event = createValidationCommandAuditEvent(result, validApproval)

    expect(event.action).toBe('validation_command')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('Dry-run command')
  })

  it('creates blocked audit event', () => {
    const request = makeRequest()
    const result = evaluateValidationCommandGate(request, readOnlyPolicy, undefined)
    const event = createValidationCommandAuditEvent(result, undefined)

    expect(event.action).toBe('validation_command')
    expect(event.status).toBe('blocked')
    expect(event.detail).toContain('blocked')
  })
})

describe('validation command gate tool', () => {
  it('has correct tool metadata', () => {
    expect(validationCommandGateTool.name).toBe('validation_command_gate')
    expect(validationCommandGateTool.capability).toBe('VALIDATION_COMMAND')
  })

  it('executes with valid input and returns combined output', async () => {
    const output = await validationCommandGateTool.execute(
      {
        command: 'npm run typecheck',
        reason: 'Check types',
        dryRun: true,
      },
      testContext,
    )

    expect(output).toContain('CodeMind validation command gate')
    expect(output).toContain('Decision: BLOCKED')
  })

  it('rejects missing input', async () => {
    await expect(validationCommandGateTool.execute(null, testContext)).rejects.toThrow('Missing validation command gate input')
  })

  it('rejects missing command', async () => {
    await expect(
      validationCommandGateTool.execute({ command: '', reason: 'test' }, testContext),
    ).rejects.toThrow('Missing command')
  })

  it('rejects missing reason', async () => {
    await expect(
      validationCommandGateTool.execute({ command: 'npm test', reason: '' }, testContext),
    ).rejects.toThrow('Missing reason')
  })

  it('defaults dryRun to true when not provided', async () => {
    const output = await validationCommandGateTool.execute(
      {
        command: 'npm test',
        reason: 'Run tests',
      },
      testContext,
    )

    expect(output).toContain('Dry run: yes')
  })

  it('shows blocked for non-allowlisted command', async () => {
    const output = await validationCommandGateTool.execute(
      {
        command: 'curl evil.com',
        reason: 'Test',
        dryRun: true,
      },
      testContext,
    )

    expect(output).toContain('BLOCKED')
    expect(output).toContain('not allowlisted')
  })
})

describe('validation command registry', () => {
  it('includes validation_command_gate tool', () => {
    const registry = createValidationCommandRuntimeRegistry({})

    expect(registry.has('validation_command_gate')).toBe(true)
    const tool = registry.getOrThrow('validation_command_gate')
    expect(tool.name).toBe('validation_command_gate')
  })

  it('inherits all Phase L tools', () => {
    const registry = createValidationCommandRuntimeRegistry({})

    expect(registry.has('local_file_write')).toBe(true)
    expect(registry.has('write_intent_plan')).toBe(true)
    expect(registry.has('operator_review_packet')).toBe(true)
    expect(registry.has('ajna_live_read_review')).toBe(true)
  })
})

describe('CLI validation command', () => {
  it('renders validation command gate from fixture file', async () => {
    const fixture = {
      command: 'npm run typecheck',
      reason: 'Verify types after refactor',
      dryRun: true,
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-cmd-'))
    const fixturePath = path.join(tmpDir, 'validation-cmd-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeValidationCommand(fixturePath, tmpDir)

    expect(output).toContain('CodeMind validation command gate')
    expect(output).toContain('Command: npm run typecheck')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('shows BLOCKED for non-allowlisted command fixture', async () => {
    const fixture = {
      command: 'rm -rf /',
      reason: 'Delete everything',
      dryRun: true,
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-cmd-'))
    const fixturePath = path.join(tmpDir, 'validation-cmd-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeValidationCommand(fixturePath, tmpDir)

    expect(output).toContain('BLOCKED')
    expect(output).toContain('not allowlisted')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws on missing command', async () => {
    const fixture = { reason: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-cmd-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeValidationCommand(fixturePath, tmpDir)).rejects.toThrow('non-empty "command"')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws on missing reason', async () => {
    const fixture = { command: 'npm test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-cmd-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeValidationCommand(fixturePath, tmpDir)).rejects.toThrow('non-empty "reason"')

    fs.rmSync(tmpDir, { recursive: true })
  })
})
