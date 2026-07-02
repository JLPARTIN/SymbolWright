import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  evaluatePrPreparation,
  renderPrPreparation,
  type PrPreparationInput,
} from './pr-preparation.js'
import { createPrPreparationAuditEvent } from './pr-preparation-audit.js'
import { prPreparationTool } from '../tools/pr-preparation-tool.js'
import { createFixtureRegistry } from '../registry/fixture-registry-factory.js'
import type { RuntimeToolContext } from '../types.js'
import { renderRuntimePrPreparation } from '../../cli-runtime-pr-preparation.js'

const testContext: RuntimeToolContext = {
  cwd: '/test/workspace',
  policy: {
    mode: 'READ_ONLY',
    allowNetwork: false,
    allowReadOnlyNetwork: true,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  },
}

function makeInput(overrides: Partial<PrPreparationInput> = {}): PrPreparationInput {
  return {
    title: overrides.title ?? 'Phase N: PR preparation',
    body: overrides.body ?? 'Add PR preparation from approved local changes.',
    baseBranch: overrides.baseBranch ?? 'main',
    headBranch: overrides.headBranch ?? 'feature/phase-n',
    changedFiles: overrides.changedFiles ?? ['src/pr-prep.ts', 'src/pr-prep.spec.ts'],
    validationChecklist: overrides.validationChecklist ?? ['npm run typecheck', 'npm test'],
    reason: overrides.reason ?? 'Prepare PR for Phase N delivery',
  }
}

describe('PR preparation', () => {
  it('evaluates as READY with valid input', () => {
    const result = evaluatePrPreparation(makeInput())

    expect(result.decision).toBe('READY')
    expect(result.issues).toHaveLength(0)
    expect(result.title).toBe('Phase N: PR preparation')
    expect(result.baseBranch).toBe('main')
    expect(result.headBranch).toBe('feature/phase-n')
  })

  it('marks INCOMPLETE when title is empty', () => {
    const result = evaluatePrPreparation(makeInput({ title: '' }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('PR title must not be empty.')
  })

  it('marks INCOMPLETE when body is empty', () => {
    const result = evaluatePrPreparation(makeInput({ body: '' }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('PR body must not be empty.')
  })

  it('marks INCOMPLETE when base branch is empty', () => {
    const result = evaluatePrPreparation(makeInput({ baseBranch: '' }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('Base branch must be specified.')
  })

  it('marks INCOMPLETE when head branch is empty', () => {
    const result = evaluatePrPreparation(makeInput({ headBranch: '' }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('Head branch must be specified.')
  })

  it('marks INCOMPLETE when branches are the same', () => {
    const result = evaluatePrPreparation(makeInput({ baseBranch: 'main', headBranch: 'main' }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('Base branch and head branch must be different.')
  })

  it('marks INCOMPLETE when no changed files', () => {
    const result = evaluatePrPreparation(makeInput({ changedFiles: [] }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('At least one changed file must be listed.')
  })

  it('marks INCOMPLETE when no validation checklist', () => {
    const result = evaluatePrPreparation(makeInput({ validationChecklist: [] }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('At least one validation checklist item is required.')
  })

  it('marks INCOMPLETE when reason is empty', () => {
    const result = evaluatePrPreparation(makeInput({ reason: '' }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues).toContain('PR preparation must include a reason.')
  })

  it('accumulates multiple issues', () => {
    const result = evaluatePrPreparation(makeInput({ title: '', body: '', reason: '' }))

    expect(result.decision).toBe('INCOMPLETE')
    expect(result.issues.length).toBeGreaterThanOrEqual(3)
  })

  it('creates checklist items from validation list', () => {
    const result = evaluatePrPreparation(
      makeInput({ validationChecklist: ['npm test', 'npm run lint'] }),
    )

    expect(result.validationChecklist).toHaveLength(2)
    expect(result.validationChecklist[0]?.label).toBe('npm test')
    expect(result.validationChecklist[0]?.required).toBe(true)
    expect(result.validationChecklist[1]?.label).toBe('npm run lint')
  })

  it('preserves changed files', () => {
    const result = evaluatePrPreparation(makeInput({ changedFiles: ['a.ts', 'b.ts', 'c.ts'] }))

    expect(result.changedFiles).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })
})

describe('PR preparation renderer', () => {
  it('renders READY result with body', () => {
    const result = evaluatePrPreparation(makeInput())
    const output = renderPrPreparation(result)

    expect(output).toContain('CodeMind PR preparation')
    expect(output).toContain('Decision: READY')
    expect(output).toContain('Title: Phase N: PR preparation')
    expect(output).toContain('Base: main')
    expect(output).toContain('Head: feature/phase-n')
    expect(output).toContain('Body:')
    expect(output).toContain('Add PR preparation from approved local changes.')
    expect(output).toContain('PREPARATION_ONLY')
    expect(output).toContain('No branch has been pushed')
    expect(output).toContain('No PR has been created')
  })

  it('renders changed files', () => {
    const result = evaluatePrPreparation(makeInput())
    const output = renderPrPreparation(result)

    expect(output).toContain('Changed files:')
    expect(output).toContain('- src/pr-prep.ts')
    expect(output).toContain('- src/pr-prep.spec.ts')
  })

  it('renders validation checklist with checkboxes', () => {
    const result = evaluatePrPreparation(makeInput())
    const output = renderPrPreparation(result)

    expect(output).toContain('Validation checklist:')
    expect(output).toContain('- [ ] npm run typecheck')
    expect(output).toContain('- [ ] npm test')
  })

  it('renders INCOMPLETE result with issues', () => {
    const result = evaluatePrPreparation(makeInput({ title: '', body: '' }))
    const output = renderPrPreparation(result)

    expect(output).toContain('Decision: INCOMPLETE')
    expect(output).toContain('Issues:')
    expect(output).toContain('- PR title must not be empty.')
    expect(output).toContain('- PR body must not be empty.')
  })

  it('does not render body for INCOMPLETE result', () => {
    const result = evaluatePrPreparation(makeInput({ title: '' }))
    const output = renderPrPreparation(result)

    expect(output).not.toContain('Body:')
  })

  it('renders reason', () => {
    const result = evaluatePrPreparation(makeInput({ reason: 'Ship feature X' }))
    const output = renderPrPreparation(result)

    expect(output).toContain('Reason: Ship feature X')
  })
})

describe('PR preparation audit', () => {
  it('creates allowed audit event for READY result', () => {
    const result = evaluatePrPreparation(makeInput())
    const event = createPrPreparationAuditEvent(result)

    expect(event.action).toBe('pr_preparation')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('Phase N: PR preparation')
    expect(event.detail).toContain('ready for review')
    expect(event.detail).toContain('2 files')
  })

  it('creates blocked audit event for INCOMPLETE result', () => {
    const result = evaluatePrPreparation(makeInput({ title: '' }))
    const event = createPrPreparationAuditEvent(result)

    expect(event.action).toBe('pr_preparation')
    expect(event.status).toBe('blocked')
    expect(event.detail).toContain('incomplete')
  })
})

describe('PR preparation tool', () => {
  it('has correct tool metadata', () => {
    expect(prPreparationTool.name).toBe('pr_preparation')
    expect(prPreparationTool.capability).toBe('PR_PREPARATION')
  })

  it('executes with valid input and returns combined output', async () => {
    const output = await prPreparationTool.execute(makeInput(), testContext)

    expect(output).toContain('CodeMind PR preparation')
    expect(output).toContain('Decision: READY')
    expect(output).toContain('Runtime audit log')
  })

  it('rejects missing input', async () => {
    await expect(prPreparationTool.execute(null, testContext)).rejects.toThrow(
      'Missing PR preparation input',
    )
  })

  it('rejects missing title', async () => {
    await expect(
      prPreparationTool.execute({ ...makeInput(), title: '' }, testContext),
    ).rejects.toThrow('Missing title')
  })

  it('rejects missing body', async () => {
    await expect(
      prPreparationTool.execute({ ...makeInput(), body: '' }, testContext),
    ).rejects.toThrow('Missing body')
  })

  it('rejects missing baseBranch', async () => {
    await expect(
      prPreparationTool.execute({ ...makeInput(), baseBranch: '' }, testContext),
    ).rejects.toThrow('Missing baseBranch')
  })

  it('rejects missing headBranch', async () => {
    await expect(
      prPreparationTool.execute({ ...makeInput(), headBranch: '' }, testContext),
    ).rejects.toThrow('Missing headBranch')
  })

  it('rejects missing reason', async () => {
    await expect(
      prPreparationTool.execute({ ...makeInput(), reason: '' }, testContext),
    ).rejects.toThrow('Missing reason')
  })

  it('shows INCOMPLETE for same branches', async () => {
    const output = await prPreparationTool.execute(
      { ...makeInput(), baseBranch: 'main', headBranch: 'main' },
      testContext,
    )

    expect(output).toContain('INCOMPLETE')
    expect(output).toContain('must be different')
  })
})

describe('PR preparation registry', () => {
  it('includes pr_preparation tool', () => {
    const registry = createFixtureRegistry('pr_preparation')

    expect(registry.has('pr_preparation')).toBe(true)
    const tool = registry.getOrThrow('pr_preparation')
    expect(tool.name).toBe('pr_preparation')
  })

  it('inherits all Phase M tools', () => {
    const registry = createFixtureRegistry('pr_preparation')

    expect(registry.has('validation_command_gate')).toBe(true)
    expect(registry.has('local_file_write')).toBe(true)
    expect(registry.has('write_intent_plan')).toBe(true)
    expect(registry.has('operator_review_packet')).toBe(true)
  })
})

describe('CLI PR preparation', () => {
  it('renders PR preparation from fixture file', async () => {
    const fixture = {
      title: 'Phase N: PR prep',
      body: 'Add PR preparation feature.',
      baseBranch: 'main',
      headBranch: 'feature/phase-n',
      changedFiles: ['src/pr-prep.ts'],
      validationChecklist: ['npm test'],
      reason: 'Deliver Phase N',
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prep-'))
    const fixturePath = path.join(tmpDir, 'pr-prep-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimePrPreparation(fixturePath, tmpDir)

    expect(output).toContain('CodeMind PR preparation')
    expect(output).toContain('Title: Phase N: PR prep')
    expect(output).toContain('PREPARATION_ONLY')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('shows INCOMPLETE for missing changed files', async () => {
    const fixture = {
      title: 'PR without files',
      body: 'Empty changeset.',
      baseBranch: 'main',
      headBranch: 'feature/empty',
      changedFiles: [],
      validationChecklist: ['npm test'],
      reason: 'Test empty changeset',
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prep-'))
    const fixturePath = path.join(tmpDir, 'pr-prep-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimePrPreparation(fixturePath, tmpDir)

    expect(output).toContain('INCOMPLETE')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws on missing title', async () => {
    const fixture = { body: 'test', reason: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prep-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimePrPreparation(fixturePath, tmpDir)).rejects.toThrow(
      'non-empty "title"',
    )

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws on missing body', async () => {
    const fixture = { title: 'test', reason: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prep-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimePrPreparation(fixturePath, tmpDir)).rejects.toThrow(
      'non-empty "body"',
    )

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws on missing reason', async () => {
    const fixture = { title: 'test', body: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prep-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimePrPreparation(fixturePath, tmpDir)).rejects.toThrow(
      'non-empty "reason"',
    )

    fs.rmSync(tmpDir, { recursive: true })
  })
})
