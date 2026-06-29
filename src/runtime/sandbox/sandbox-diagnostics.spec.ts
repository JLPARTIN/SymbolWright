import { describe, expect, it } from 'vitest'

import {
  renderSandboxReadinessReport,
  runSandboxReadinessCheck,
  type SandboxCommandProbe,
} from './sandbox-diagnostics.js'

describe('runSandboxReadinessCheck', () => {
  it('reports ready when Docker probe succeeds', () => {
    const probe: SandboxCommandProbe = () => ({
      status: 0,
      stdout: '27.0.0\n',
      stderr: '',
      error: null,
    })

    const report = runSandboxReadinessCheck({ dockerBinary: 'docker' }, probe)

    expect(report.ready).toBe(true)
    expect(report.failCount).toBe(0)
    expect(report.passCount).toBeGreaterThanOrEqual(3)
    expect(report.checks.some((check) => check.name === 'Docker availability')).toBe(true)
  })

  it('reports unavailable Docker as a blocking sandbox diagnostic', () => {
    const probe: SandboxCommandProbe = () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: 'spawn docker ENOENT',
    })

    const report = runSandboxReadinessCheck({ dockerBinary: 'docker' }, probe)

    expect(report.ready).toBe(false)
    expect(report.failCount).toBe(1)
    expect(report.checks.find((check) => check.name === 'Docker availability')?.detail).toContain(
      'sandbox execution will stop instead of using host fallback',
    )
  })

  it('includes resolved sandbox config in the report', () => {
    const probe: SandboxCommandProbe = () => ({
      status: 0,
      stdout: '27.0.0\n',
      stderr: '',
      error: null,
    })

    const report = runSandboxReadinessCheck(
      { image: 'node:22-bookworm-slim', memory: '1g', cpus: '2' },
      probe,
    )

    expect(report.config.image).toBe('node:22-bookworm-slim')
    expect(report.config.memory).toBe('1g')
    expect(report.config.cpus).toBe('2')
  })
})

describe('renderSandboxReadinessReport', () => {
  it('renders operator-readable diagnostics', () => {
    const probe: SandboxCommandProbe = () => ({
      status: 0,
      stdout: '27.0.0\n',
      stderr: '',
      error: null,
    })
    const output = renderSandboxReadinessReport(runSandboxReadinessCheck({}, probe))

    expect(output).toContain('CodeMind sandbox readiness')
    expect(output).toContain('Ready: yes')
    expect(output).toContain('Docker availability')
    expect(output).toContain('Summary:')
  })
})
