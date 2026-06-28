import { describe, expect, it } from 'vitest'

import { createRecoveryChangeLedger, renderRecoveryChangeLedger } from './change-ledger.js'
import { createRollbackPlan, renderRollbackPlan } from './rollback-plan.js'

const first = {
  id: 'change-1',
  kind: 'created' as const,
  targetPath: 'src/generated.ts',
  reason: 'Create generated file',
  rollbackNote: 'Remove generated file',
  nextContent: 'export const generated = true\n',
}

const second = {
  id: 'change-2',
  kind: 'updated' as const,
  targetPath: 'src/existing.ts',
  reason: 'Update existing file',
  rollbackNote: 'Restore prior content',
  previousContent: 'export const oldValue = true\n',
  nextContent: 'export const newValue = true\n',
}

describe('RecoveryChangeLedger', () => {
  it('records changes in insertion order', () => {
    const ledger = createRecoveryChangeLedger([first, second])

    expect(ledger.isEmpty()).toBe(false)
    expect(ledger.list().map((record) => record.id)).toEqual(['change-1', 'change-2'])
  })

  it('rejects duplicate record ids', () => {
    expect(() => createRecoveryChangeLedger([first, first])).toThrow(
      'Recovery change record already exists',
    )
  })

  it('renders ledger output', () => {
    const output = renderRecoveryChangeLedger(createRecoveryChangeLedger([first, second]))

    expect(output).toContain('CodeMind recovery change ledger')
    expect(output).toContain('Changes: 2')
  })
})

describe('rollback plan', () => {
  it('renders rollback steps', () => {
    const plan = createRollbackPlan('Recover local changes', [first, second])
    const output = renderRollbackPlan(plan)

    expect(plan.steps).toHaveLength(2)
    expect(output).toContain('Rollback plan: Recover local changes')
    expect(output).toContain('src/generated.ts')
    expect(output).toContain('src/existing.ts')
  })
})
