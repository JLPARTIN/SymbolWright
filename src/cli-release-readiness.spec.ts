import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  RELEASE_READINESS_BLOCK_ID,
  assessReleaseReadiness,
  renderReleaseReadinessReport,
} from './cli-release-readiness.js'

const WORKSPACE = path.resolve(import.meta.dirname, '..')

describe('assessReleaseReadiness', () => {
  it('returns a report with block ID', () => {
    const report = assessReleaseReadiness(WORKSPACE)

    expect(report.blockId).toBe(RELEASE_READINESS_BLOCK_ID)
  })

  it('passes all gates for valid workspace', () => {
    const report = assessReleaseReadiness(WORKSPACE)

    expect(report.outcome).toBe('RELEASE_READY')
    expect(report.failCount).toBe(0)
  })

  it('checks all required gates', () => {
    const report = assessReleaseReadiness(WORKSPACE)
    const codes = report.gates.map((g) => g.code)

    expect(codes).toContain('PHASES_COMPLETE')
    expect(codes).toContain('DOCTOR_HEALTHY')
    expect(codes).toContain('PACKAGE_VERSION')
    expect(codes).toContain('CHANGELOG_CURRENT')
    expect(codes).toContain('ENTRY_POINT')
    expect(codes).toContain('INDEX_EXPORTS')
    expect(codes).toContain('CLI_ENTRY')
    expect(codes).toContain('DOCKERFILE')
  })

  it('includes doctor report', () => {
    const report = assessReleaseReadiness(WORKSPACE)

    expect(report.doctorReport).toBeDefined()
    expect(report.doctorReport.healthy).toBe(true)
  })

  it('blocks on invalid workspace', () => {
    const report = assessReleaseReadiness('/nonexistent/path')

    expect(report.outcome).toBe('RELEASE_BLOCKED')
    expect(report.failCount).toBeGreaterThan(0)
  })
})

describe('renderReleaseReadinessReport', () => {
  it('renders ready report', () => {
    const report = assessReleaseReadiness(WORKSPACE)
    const output = renderReleaseReadinessReport(report)

    expect(output).toContain('CodeMind Release Readiness')
    expect(output).toContain('Outcome: RELEASE_READY')
    expect(output).toContain('[PASS]')
  })

  it('renders blocked report with blockers', () => {
    const report = assessReleaseReadiness('/nonexistent/path')
    const output = renderReleaseReadinessReport(report)

    expect(output).toContain('RELEASE_BLOCKED')
    expect(output).toContain('Blockers:')
  })
})
