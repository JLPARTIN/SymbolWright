import { describe, expect, it } from 'vitest'

import {
  checkHiveMindRegistry,
  checkAjnaPipeline,
  checkPersistenceLayer,
  checkAgentLoop,
  checkToolRegistry,
  checkTuiLayer,
  runActivationReadinessChecks,
  renderActivationReadiness,
} from './activation-readiness.js'

const WORKSPACE = process.cwd()

describe('activation readiness checks', () => {
  it('checkHiveMindRegistry passes with all agent types', () => {
    const check = checkHiveMindRegistry()
    expect(check.status).toBe('PASS')
    expect(check.detail).toContain('5/5')
  })

  it('checkAjnaPipeline detects core modules', () => {
    const check = checkAjnaPipeline()
    expect(check.status).toBe('PASS')
    expect(check.detail).toContain('4')
  })

  it('checkPersistenceLayer detects storage modules', () => {
    const check = checkPersistenceLayer()
    expect(check.status).toBe('PASS')
    expect(check.detail).toContain('3')
  })

  it('checkAgentLoop detects agent modules', () => {
    const check = checkAgentLoop()
    expect(check.status).toBe('PASS')
    expect(check.detail).toContain('3')
  })

  it('checkToolRegistry finds tool definitions', () => {
    const check = checkToolRegistry(WORKSPACE)
    expect(check.status).toBe('PASS')
    expect(check.detail).toContain('tool definitions')
  })

  it('checkTuiLayer detects TUI modules', () => {
    const check = checkTuiLayer()
    expect(check.status).toBe('PASS')
    expect(check.detail).toContain('3')
  })
})

describe('runActivationReadinessChecks', () => {
  it('returns checks for all subsystems', () => {
    const checks = runActivationReadinessChecks(WORKSPACE)
    expect(checks.length).toBeGreaterThanOrEqual(7)

    const names = checks.map((c) => c.name)
    expect(names).toContain('Agent loop')
    expect(names).toContain('HiveMind registry')
    expect(names).toContain('Ajna pipeline')
    expect(names).toContain('Persistence layer')
    expect(names).toContain('TUI layer')
    expect(names).toContain('Tool registry')
  })

  it('has no FAIL checks in workspace', () => {
    const checks = runActivationReadinessChecks(WORKSPACE)
    const failures = checks.filter((c) => c.status === 'FAIL')
    expect(failures).toHaveLength(0)
  })
})

describe('renderActivationReadiness', () => {
  it('renders readable output', () => {
    const checks = runActivationReadinessChecks(WORKSPACE)
    const output = renderActivationReadiness(checks)

    expect(output).toContain('CodeMind Activation Readiness')
    expect(output).toContain('[PASS]')
    expect(output).toContain('Summary:')
  })

  it('shows READY status when no failures', () => {
    const checks = runActivationReadinessChecks(WORKSPACE)
    const output = renderActivationReadiness(checks)

    expect(output).toContain('READY FOR ACTIVATION')
  })

  it('shows NOT READY when failures exist', () => {
    const failingChecks = [
      { name: 'Test check', status: 'FAIL' as const, detail: 'broken' },
    ]
    const output = renderActivationReadiness(failingChecks)

    expect(output).toContain('NOT READY')
  })
})
