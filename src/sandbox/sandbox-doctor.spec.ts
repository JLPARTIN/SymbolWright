import { describe, expect, it } from 'vitest'

import { runnerAvailability } from './sandbox-registry.js'
import {
  buildSandboxDoctorReport,
  renderSandboxDoctorReport,
  renderSandboxImagesReport,
} from './sandbox-doctor.js'

const CHECKED_AT = '2026-07-20T00:00:00.000Z'
const NOW = '2026-07-21T00:00:00.000Z'

function availability() {
  return new Map([
    [
      'docker',
      runnerAvailability('available', CHECKED_AT, {
        version: '27.0.0',
      }),
    ],
    [
      'node',
      runnerAvailability('available', CHECKED_AT, {
        version: '22.0.0',
      }),
    ],
    [
      'python3',
      runnerAvailability('unavailable', CHECKED_AT, {
        reason: 'python3 was not found on PATH.',
      }),
    ],
  ])
}

describe('sandbox doctor', () => {
  it('builds a read-only report without enabling execution or pulling images', async () => {
    const report = await buildSandboxDoctorReport({
      env: { SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
      now: () => new Date(NOW),
      discoverCommandAvailability: async () => availability(),
    })

    expect(report.blockId).toBe('SYMBOLWRIGHT-SANDBOX-DOCTOR-01')
    expect(report.generatedAt).toBe(NOW)
    expect(report.readOnly).toBe(true)
    expect(report.executionEnabled).toBe(false)
    expect(report.guardedHostOptIn).toBe(true)
    expect(report.containerEngine.engine).toBe('docker')
    expect(report.containerEngine.version).toBe('27.0.0')
    expect(report.images.every((image) => image.enabled === false)).toBe(true)
    expect(report.images.every((image) => image.installed === false)).toBe(true)
    expect(report.images.some((image) => image.image.endsWith(':latest'))).toBe(false)
    expect(report.preparationCommands).toContain('docker pull python:3.12-slim')
    expect(report.warnings.join('\n')).toContain('does not run repository code')
  })

  it('renders operator-reviewed diagnostics and image commands honestly', async () => {
    const report = await buildSandboxDoctorReport({
      env: {},
      now: () => new Date(NOW),
      discoverCommandAvailability: async () => availability(),
    })

    const rendered = renderSandboxDoctorReport(report)
    expect(rendered).toContain('Mode: READ-ONLY')
    expect(rendered).toContain('Execution enabled: false')
    expect(rendered).toContain('Guarded-host opt-in: false')
    expect(rendered).toContain('docker pull node:22-bookworm-slim')
    expect(rendered).toContain('Images are never pulled automatically')

    const images = renderSandboxImagesReport(report)
    expect(images).toContain('SymbolWright Sandbox Images')
    expect(images).toContain('Preparation commands are shown for operator review only')
  })

  it('withholds image preparation commands when no container engine is available', async () => {
    const report = await buildSandboxDoctorReport({
      env: {},
      now: () => new Date(NOW),
      discoverCommandAvailability: async () => new Map(),
    })

    expect(report.containerEngine.engine).toBe('none')
    expect(report.preparationCommands).toEqual([])
    expect(renderSandboxDoctorReport(report)).toContain('no container engine is available')
  })
})
