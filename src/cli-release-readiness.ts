import fs from 'node:fs'
import path from 'node:path'

import {
  getCompletedRuntimeBuildPhaseCount,
  RUNTIME_BUILD_PHASES,
} from './runtime/runtime-build-state.js'
import { runDoctor, type DoctorReport } from './cli-doctor.js'

export const RELEASE_READINESS_BLOCK_ID = 'CODEMIND-RELEASE-01' as const

export type ReleaseReadinessOutcome = 'RELEASE_READY' | 'RELEASE_BLOCKED'

export type ReleaseGateCode =
  | 'PHASES_COMPLETE'
  | 'DOCTOR_HEALTHY'
  | 'PACKAGE_VERSION'
  | 'ENTRY_POINT'
  | 'INDEX_EXPORTS'
  | 'CLI_ENTRY'
  | 'DOCKERFILE'

export type ReleaseGateStatus = 'PASS' | 'FAIL'

export interface ReleaseGate {
  readonly code: ReleaseGateCode
  readonly status: ReleaseGateStatus
  readonly detail: string
}

export interface ReleaseReadinessReport {
  readonly blockId: typeof RELEASE_READINESS_BLOCK_ID
  readonly outcome: ReleaseReadinessOutcome
  readonly gates: readonly ReleaseGate[]
  readonly passCount: number
  readonly failCount: number
  readonly doctorReport: DoctorReport
}

function checkAllPhasesComplete(): ReleaseGate {
  const completed = getCompletedRuntimeBuildPhaseCount()
  const total = RUNTIME_BUILD_PHASES.length
  return {
    code: 'PHASES_COMPLETE',
    status: completed === total ? 'PASS' : 'FAIL',
    detail: `${completed}/${total} runtime phases complete`,
  }
}

function checkDoctorHealthy(doctorReport: DoctorReport): ReleaseGate {
  return {
    code: 'DOCTOR_HEALTHY',
    status: doctorReport.healthy ? 'PASS' : 'FAIL',
    detail: doctorReport.healthy
      ? `All ${doctorReport.passCount} checks passed`
      : `${doctorReport.failCount} check(s) failed`,
  }
}

function checkPackageVersion(workspaceRoot: string): ReleaseGate {
  try {
    const pkgPath = path.join(workspaceRoot, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }
    if (typeof pkg.version === 'string' && pkg.version.length > 0) {
      return { code: 'PACKAGE_VERSION', status: 'PASS', detail: `v${pkg.version}` }
    }
    return { code: 'PACKAGE_VERSION', status: 'FAIL', detail: 'Missing version in package.json' }
  } catch {
    return { code: 'PACKAGE_VERSION', status: 'FAIL', detail: 'Cannot read package.json' }
  }
}

function checkEntryPoint(workspaceRoot: string): ReleaseGate {
  const entryPath = path.join(workspaceRoot, 'src', 'index.ts')
  if (fs.existsSync(entryPath)) {
    return { code: 'ENTRY_POINT', status: 'PASS', detail: 'src/index.ts present' }
  }
  return { code: 'ENTRY_POINT', status: 'FAIL', detail: 'src/index.ts missing' }
}

function checkIndexExports(workspaceRoot: string): ReleaseGate {
  try {
    const indexPath = path.join(workspaceRoot, 'src', 'index.ts')
    const content = fs.readFileSync(indexPath, 'utf8')
    const exportCount = (content.match(/^export /gm) ?? []).length
    if (exportCount > 0) {
      return { code: 'INDEX_EXPORTS', status: 'PASS', detail: `${exportCount} export statement(s)` }
    }
    return { code: 'INDEX_EXPORTS', status: 'FAIL', detail: 'No exports found in index.ts' }
  } catch {
    return { code: 'INDEX_EXPORTS', status: 'FAIL', detail: 'Cannot read index.ts' }
  }
}

function checkCliEntry(workspaceRoot: string): ReleaseGate {
  const cliPath = path.join(workspaceRoot, 'src', 'cli.ts')
  if (fs.existsSync(cliPath)) {
    return { code: 'CLI_ENTRY', status: 'PASS', detail: 'src/cli.ts present' }
  }
  return { code: 'CLI_ENTRY', status: 'FAIL', detail: 'src/cli.ts missing' }
}

function checkDockerfile(workspaceRoot: string): ReleaseGate {
  const dockerPath = path.join(workspaceRoot, 'Dockerfile')
  if (fs.existsSync(dockerPath)) {
    return { code: 'DOCKERFILE', status: 'PASS', detail: 'Dockerfile present' }
  }
  return { code: 'DOCKERFILE', status: 'FAIL', detail: 'Dockerfile missing' }
}

export function assessReleaseReadiness(workspaceRoot: string): ReleaseReadinessReport {
  const doctorReport = runDoctor(workspaceRoot)

  const gates: ReleaseGate[] = [
    checkAllPhasesComplete(),
    checkDoctorHealthy(doctorReport),
    checkPackageVersion(workspaceRoot),
    checkEntryPoint(workspaceRoot),
    checkIndexExports(workspaceRoot),
    checkCliEntry(workspaceRoot),
    checkDockerfile(workspaceRoot),
  ]

  const passCount = gates.filter((g) => g.status === 'PASS').length
  const failCount = gates.filter((g) => g.status === 'FAIL').length

  return {
    blockId: RELEASE_READINESS_BLOCK_ID,
    outcome: failCount === 0 ? 'RELEASE_READY' : 'RELEASE_BLOCKED',
    gates,
    passCount,
    failCount,
    doctorReport,
  }
}

export function renderReleaseReadinessReport(report: ReleaseReadinessReport): string {
  const lines = [
    'CodeMind Release Readiness',
    '',
    `Block: ${report.blockId}`,
    `Outcome: ${report.outcome}`,
    '',
    'Release gates:',
    ...report.gates.map((g) => `  [${g.status}] ${g.code}: ${g.detail}`),
    '',
    `Summary: ${report.passCount} passed, ${report.failCount} failed`,
  ]

  if (report.outcome === 'RELEASE_BLOCKED') {
    const blockers = report.gates.filter((g) => g.status === 'FAIL')
    lines.push('', 'Blockers:')
    for (const b of blockers) {
      lines.push(`  - ${b.code}: ${b.detail}`)
    }
  }

  return lines.join('\n')
}

export function renderReleaseReadinessCommand(workspaceRoot: string): string {
  const report = assessReleaseReadiness(workspaceRoot)
  return renderReleaseReadinessReport(report)
}
