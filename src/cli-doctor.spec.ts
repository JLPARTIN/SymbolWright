import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { DOCTOR_BLOCK_ID, runDoctor, renderDoctorReport } from './cli-doctor.js'

const WORKSPACE = path.resolve(import.meta.dirname, '..')

describe('runDoctor', () => {
  it('returns a report with block ID', () => {
    const report = runDoctor(WORKSPACE)

    expect(report.blockId).toBe(DOCTOR_BLOCK_ID)
  })

  it('detects healthy workspace', () => {
    const report = runDoctor(WORKSPACE)

    expect(report.healthy).toBe(true)
    expect(report.failCount).toBe(0)
  })

  it('checks Node.js version', () => {
    const report = runDoctor(WORKSPACE)
    const nodeCheck = report.checks.find((c) => c.name === 'Node.js version')

    expect(nodeCheck).toBeDefined()
    expect(nodeCheck?.status).toBe('PASS')
  })

  it('checks package.json', () => {
    const report = runDoctor(WORKSPACE)
    const pkgCheck = report.checks.find((c) => c.name === 'package.json')

    expect(pkgCheck).toBeDefined()
    expect(pkgCheck?.status).toBe('PASS')
    expect(pkgCheck?.detail).toContain('codemind')
  })

  it('checks runtime phases', () => {
    const report = runDoctor(WORKSPACE)
    const phaseCheck = report.checks.find((c) => c.name === 'Runtime phases')

    expect(phaseCheck).toBeDefined()
    expect(phaseCheck?.status).toBe('PASS')
    expect(phaseCheck?.detail).toContain('20/20')
  })

  it('checks safety posture', () => {
    const report = runDoctor(WORKSPACE)
    const safetyCheck = report.checks.find((c) => c.name === 'Safety posture')

    expect(safetyCheck).toBeDefined()
    expect(safetyCheck?.status).toBe('WARN')
  })

  it('checks provider gateway readiness without requiring live provider calls', () => {
    const report = runDoctor(WORKSPACE)
    const providerCheck = report.checks.find((c) => c.name === 'Provider gateway')

    expect(providerCheck).toBeDefined()
    expect(providerCheck?.status).not.toBe('FAIL')
    expect(providerCheck?.detail).toContain('providers registered')
    expect(providerCheck?.detail).toContain('secrets redacted')
  })

  it('checks sandbox configuration and readiness without requiring host fallback', () => {
    const report = runDoctor(WORKSPACE)
    const configCheck = report.checks.find((c) => c.name === 'Sandbox configuration')
    const readinessCheck = report.checks.find((c) => c.name === 'Sandbox readiness')

    expect(configCheck).toBeDefined()
    expect(configCheck?.status).toBe('PASS')
    expect(configCheck?.detail).toContain('image=')
    expect(configCheck?.detail).toContain('network=none')
    expect(readinessCheck).toBeDefined()
    expect(readinessCheck?.status).not.toBe('FAIL')
  })

  it('detects missing workspace', () => {
    const report = runDoctor('/nonexistent/path')

    expect(report.healthy).toBe(false)
    expect(report.failCount).toBeGreaterThan(0)
  })
})

describe('renderDoctorReport', () => {
  it('renders readable output', () => {
    const report = runDoctor(WORKSPACE)
    const output = renderDoctorReport(report)

    expect(output).toContain('CodeMind Doctor')
    expect(output).toContain('HEALTHY')
    expect(output).toContain('[PASS]')
    expect(output).toContain('passed')
  })

  it('renders provider gateway proof', () => {
    const output = renderDoctorReport(runDoctor(WORKSPACE))

    expect(output).toContain('Provider gateway')
    expect(output).toContain('secrets redacted')
  })

  it('renders sandbox diagnostics', () => {
    const output = renderDoctorReport(runDoctor(WORKSPACE))

    expect(output).toContain('Sandbox configuration')
    expect(output).toContain('Sandbox readiness')
    expect(output).toContain('network=none')
  })
})
