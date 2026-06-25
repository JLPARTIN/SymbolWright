import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createWriteIntent, renderWriteIntent, type WriteIntentTarget } from './write-intent.js'
import { validateWriteIntent, renderWriteIntentValidation } from './write-intent-validator.js'
import { createWriteApprovalTicket, renderWriteApprovalTicket } from './write-approval-ticket.js'

import { writeIntentPlanTool } from '../tools/write-intent-plan-tool.js'
import { createWritePrepRuntimeRegistry } from '../runtime-write-prep-registry.js'
import type { RuntimeToolContext } from '../types.js'
import { renderRuntimeWriteIntent } from '../../cli-runtime-write-intent.js'

const testContext: RuntimeToolContext = {
  cwd: '/test/workspace',
  policy: {
    mode: 'READ_ONLY',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  },
}

function makeIntentInput(overrides: Partial<{
  id: string
  target: WriteIntentTarget
  targetPath: string
  reason: string
  expectedDiffSummary: string
  validationPlan: readonly string[]
  rollbackNote: string
}> = {}) {
  return {
    id: overrides.id ?? 'WI-001',
    target: overrides.target ?? ('file_edit' as WriteIntentTarget),
    targetPath: overrides.targetPath ?? 'src/cli.ts',
    reason: overrides.reason ?? 'Add new CLI command',
    expectedDiffSummary: overrides.expectedDiffSummary ?? 'Add case for new command in switch block',
    validationPlan: overrides.validationPlan ?? ['npm run typecheck', 'npm test'],
    rollbackNote: overrides.rollbackNote ?? 'Revert the added case block',
  }
}

describe('write intent', () => {
  it('creates an intent with all fields', () => {
    const intent = createWriteIntent(makeIntentInput())

    expect(intent.id).toBe('WI-001')
    expect(intent.target).toBe('file_edit')
    expect(intent.targetPath).toBe('src/cli.ts')
    expect(intent.reason).toBe('Add new CLI command')
    expect(intent.expectedDiffSummary).toBe('Add case for new command in switch block')
    expect(intent.validationPlan).toEqual(['npm run typecheck', 'npm test'])
    expect(intent.approvalTicketRequired).toBe(true)
    expect(intent.rollbackNote).toBe('Revert the added case block')
  })

  it('always requires approval ticket', () => {
    const intent = createWriteIntent(makeIntentInput())
    expect(intent.approvalTicketRequired).toBe(true)
  })

  it('renders intent with all sections', () => {
    const intent = createWriteIntent(makeIntentInput())
    const output = renderWriteIntent(intent)

    expect(output).toContain('CodeMind write intent plan')
    expect(output).toContain('Intent ID: WI-001')
    expect(output).toContain('Target: file_edit')
    expect(output).toContain('Path: src/cli.ts')
    expect(output).toContain('Reason: Add new CLI command')
    expect(output).toContain('Expected diff: Add case for new command in switch block')
    expect(output).toContain('Approval required: yes')
    expect(output).toContain('Rollback: Revert the added case block')
    expect(output).toContain('Validation plan:')
    expect(output).toContain('- npm run typecheck')
    expect(output).toContain('- npm test')
    expect(output).toContain('PLAN_ONLY')
    expect(output).toContain('No file or service has been modified')
  })
})

describe('write intent validator', () => {
  it('passes valid intent', () => {
    const intent = createWriteIntent(makeIntentInput())
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails intent with empty id', () => {
    const intent = createWriteIntent(makeIntentInput({ id: '' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Write intent must have a non-empty id.')
  })

  it('fails intent with empty target path', () => {
    const intent = createWriteIntent(makeIntentInput({ targetPath: '' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Write intent must specify a target path.')
  })

  it('fails intent with empty reason', () => {
    const intent = createWriteIntent(makeIntentInput({ reason: '' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Write intent must include a reason.')
  })

  it('fails intent with empty diff summary', () => {
    const intent = createWriteIntent(makeIntentInput({ expectedDiffSummary: '' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Write intent must include an expected diff summary.')
  })

  it('fails intent with empty rollback note', () => {
    const intent = createWriteIntent(makeIntentInput({ rollbackNote: '' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Write intent must include a rollback note.')
  })

  it('fails intent with empty validation plan', () => {
    const intent = createWriteIntent(makeIntentInput({ validationPlan: [] }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Write intent must include at least one validation step.')
  })

  it('fails intent targeting protected path .env', () => {
    const intent = createWriteIntent(makeIntentInput({ targetPath: '.env' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('protected'))).toBe(true)
  })

  it('fails intent targeting node_modules', () => {
    const intent = createWriteIntent(makeIntentInput({ targetPath: 'node_modules/pkg/index.js' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('protected'))).toBe(true)
  })

  it('fails intent targeting path outside workspace', () => {
    const intent = createWriteIntent(makeIntentInput({ targetPath: '../../etc/passwd' }))
    const result = validateWriteIntent(intent, '/test/workspace')

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('outside workspace'))).toBe(true)
  })

  it('renders PASS for valid result', () => {
    const result = { valid: true, errors: [] }
    expect(renderWriteIntentValidation(result)).toBe('Write intent validation: PASS')
  })

  it('renders FAIL with errors', () => {
    const result = { valid: false, errors: ['error 1', 'error 2'] }
    const output = renderWriteIntentValidation(result)

    expect(output).toContain('FAIL')
    expect(output).toContain('- error 1')
    expect(output).toContain('- error 2')
  })
})

describe('write approval ticket', () => {
  it('creates PENDING ticket for valid intent', () => {
    const intent = createWriteIntent(makeIntentInput())
    const validation = { valid: true, errors: [] as string[] }
    const ticket = createWriteApprovalTicket(intent, validation)

    expect(ticket.ticketId).toBe('WRITE-TICKET-WI-001')
    expect(ticket.intentId).toBe('WI-001')
    expect(ticket.target).toBe('file_edit')
    expect(ticket.targetPath).toBe('src/cli.ts')
    expect(ticket.validationPassed).toBe(true)
    expect(ticket.status).toBe('PENDING')
    expect(ticket.blockReason).toBeUndefined()
  })

  it('creates BLOCKED ticket for invalid intent', () => {
    const intent = createWriteIntent(makeIntentInput())
    const validation = { valid: false, errors: ['error one', 'error two'] }
    const ticket = createWriteApprovalTicket(intent, validation)

    expect(ticket.status).toBe('BLOCKED')
    expect(ticket.validationPassed).toBe(false)
    expect(ticket.blockReason).toContain('error one')
    expect(ticket.blockReason).toContain('error two')
  })

  it('renders PENDING ticket', () => {
    const intent = createWriteIntent(makeIntentInput())
    const validation = { valid: true, errors: [] as string[] }
    const ticket = createWriteApprovalTicket(intent, validation)
    const output = renderWriteApprovalTicket(ticket)

    expect(output).toContain('CodeMind write approval ticket')
    expect(output).toContain('Ticket ID: WRITE-TICKET-WI-001')
    expect(output).toContain('Status: PENDING')
    expect(output).toContain('Validation: PASSED')
    expect(output).toContain('pending operator approval')
    expect(output).toContain('No write action will be taken')
  })

  it('renders BLOCKED ticket', () => {
    const intent = createWriteIntent(makeIntentInput())
    const validation = { valid: false, errors: ['path is protected'] }
    const ticket = createWriteApprovalTicket(intent, validation)
    const output = renderWriteApprovalTicket(ticket)

    expect(output).toContain('Status: BLOCKED')
    expect(output).toContain('Validation: FAILED')
    expect(output).toContain('blocked due to validation failure')
  })
})

describe('write intent plan tool', () => {
  it('has correct tool metadata', () => {
    expect(writeIntentPlanTool.name).toBe('write_intent_plan')
    expect(writeIntentPlanTool.capability).toBe('WRITE_INTENT')
  })

  it('executes with valid input and returns combined output', async () => {
    const output = await writeIntentPlanTool.execute(makeIntentInput(), testContext)

    expect(output).toContain('CodeMind write intent plan')
    expect(output).toContain('Write intent validation: PASS')
    expect(output).toContain('CodeMind write approval ticket')
    expect(output).toContain('Status: PENDING')
  })

  it('rejects missing input', async () => {
    await expect(writeIntentPlanTool.execute(null, testContext)).rejects.toThrow('Missing write intent plan input')
  })

  it('rejects missing id', async () => {
    await expect(writeIntentPlanTool.execute({ ...makeIntentInput(), id: '' }, testContext)).rejects.toThrow('Missing intent id')
  })

  it('rejects invalid target', async () => {
    await expect(writeIntentPlanTool.execute({ ...makeIntentInput(), target: 'invalid' }, testContext)).rejects.toThrow('Invalid target')
  })

  it('rejects missing targetPath', async () => {
    await expect(writeIntentPlanTool.execute({ ...makeIntentInput(), targetPath: '' }, testContext)).rejects.toThrow('Missing targetPath')
  })

  it('rejects missing reason', async () => {
    await expect(writeIntentPlanTool.execute({ ...makeIntentInput(), reason: '' }, testContext)).rejects.toThrow('Missing reason')
  })

  it('shows BLOCKED for protected path', async () => {
    const input = makeIntentInput({ targetPath: '.env' })
    const output = await writeIntentPlanTool.execute(input, testContext)

    expect(output).toContain('FAIL')
    expect(output).toContain('BLOCKED')
  })
})

describe('write prep registry', () => {
  it('includes write_intent_plan tool', () => {
    const registry = createWritePrepRuntimeRegistry({})

    expect(registry.has('write_intent_plan')).toBe(true)
    const tool = registry.getOrThrow('write_intent_plan')
    expect(tool.name).toBe('write_intent_plan')
  })

  it('inherits all Phase J tools', () => {
    const registry = createWritePrepRuntimeRegistry({})

    expect(registry.has('operator_review_packet')).toBe(true)
    expect(registry.has('ajna_live_read_review')).toBe(true)
    expect(registry.has('github_live_read_pr')).toBe(true)
  })
})

describe('CLI write intent', () => {
  it('renders write intent from fixture file', async () => {
    const fixture = {
      id: 'WI-CLI-001',
      target: 'file_edit',
      targetPath: 'src/cli.ts',
      reason: 'Add write intent command',
      expectedDiffSummary: 'New case block in switch',
      validationPlan: ['npm run typecheck'],
      rollbackNote: 'Remove the case block',
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-intent-'))
    const fixturePath = path.join(tmpDir, 'write-intent-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeWriteIntent(fixturePath, tmpDir)

    expect(output).toContain('CodeMind write intent plan')
    expect(output).toContain('Intent ID: WI-CLI-001')
    expect(output).toContain('CodeMind write approval ticket')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('shows BLOCKED for protected path fixture', async () => {
    const fixture = {
      id: 'WI-CLI-002',
      target: 'file_edit',
      targetPath: '.env',
      reason: 'Edit env file',
      expectedDiffSummary: 'Add new variable',
      validationPlan: ['check'],
      rollbackNote: 'Remove variable',
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-intent-'))
    const fixturePath = path.join(tmpDir, 'write-intent-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeWriteIntent(fixturePath, tmpDir)

    expect(output).toContain('BLOCKED')
    expect(output).toContain('protected')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws on missing id', async () => {
    const fixture = { target: 'file_edit', targetPath: 'x.ts', reason: 'test', expectedDiffSummary: 'test', rollbackNote: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-intent-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeWriteIntent(fixturePath, tmpDir)).rejects.toThrow('non-empty "id"')

    fs.rmSync(tmpDir, { recursive: true })
  })
})
