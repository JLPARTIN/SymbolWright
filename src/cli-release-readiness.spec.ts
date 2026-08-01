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
    expect(codes).toContain('PUBLIC_API_CONTRACT')
    expect(codes).toContain('PACKAGE_BIN_CONTRACT')
    expect(codes).toContain('PACKAGE_LOCK_CONTRACT')
    expect(codes).toContain('UNIVERSAL_API_GATEWAY_CONTRACT')
    expect(codes).toContain('RUNTIME_MODE_TRUTH')
    expect(codes).toContain('VALIDATE_SCRIPT')
    expect(codes).toContain('WORKFLOW_RELEASE_PROOF')
    expect(codes).toContain('BUILD_LEDGER_CONSISTENT')
    expect(codes).toContain('NPM_PACK_SMOKE')
    expect(codes).toContain('DOCKER_RUNTIME_SMOKE')
    expect(codes).toContain('RELEASE_CANDIDATE_CONTRACT')
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

  it('passes the source-of-truth release proof gates', () => {
    const report = assessReleaseReadiness(WORKSPACE)
    const gates = new Map(report.gates.map((gate) => [gate.code, gate.status]))

    expect(gates.get('PUBLIC_API_CONTRACT')).toBe('PASS')
    expect(gates.get('PACKAGE_BIN_CONTRACT')).toBe('PASS')
    expect(gates.get('PACKAGE_LOCK_CONTRACT')).toBe('PASS')
    expect(gates.get('UNIVERSAL_API_GATEWAY_CONTRACT')).toBe('PASS')
    expect(gates.get('RUNTIME_MODE_TRUTH')).toBe('PASS')
    expect(gates.get('VALIDATE_SCRIPT')).toBe('PASS')
    expect(gates.get('WORKFLOW_RELEASE_PROOF')).toBe('PASS')
    expect(gates.get('BUILD_LEDGER_CONSISTENT')).toBe('PASS')
    expect(gates.get('RELEASE_CANDIDATE_CONTRACT')).toBe('PASS')
  })
})

describe('renderReleaseReadinessReport', () => {
  it('renders ready report', () => {
    const report = assessReleaseReadiness(WORKSPACE)
    const output = renderReleaseReadinessReport(report)

    expect(output).toContain('SymbolWright Release Readiness')
    expect(output).toContain('Outcome: RELEASE_READY')
    expect(output).toContain('[PASS]')
    expect(output).toContain('PUBLIC_API_CONTRACT')
    expect(output).toContain('PACKAGE_LOCK_CONTRACT')
    expect(output).toContain('UNIVERSAL_API_GATEWAY_CONTRACT')
    expect(output).toContain('RUNTIME_MODE_TRUTH')
    expect(output).toContain('BUILD_LEDGER_CONSISTENT')
  })

  it('renders blocked report with blockers', () => {
    const report = assessReleaseReadiness('/nonexistent/path')
    const output = renderReleaseReadinessReport(report)

    expect(output).toContain('RELEASE_BLOCKED')
    expect(output).toContain('Blockers:')
  })
})
