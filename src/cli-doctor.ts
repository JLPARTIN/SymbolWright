import fs from 'node:fs'
import path from 'node:path'

import { getCodemindFoundationSnapshot } from './codemind-foundation.js'
import { getCompletedRuntimeBuildPhaseCount, RUNTIME_BUILD_PHASES } from './runtime/runtime-build-state.js'

export const DOCTOR_BLOCK_ID = 'CODEMIND-DOCTOR-01' as const

export type DoctorCheckStatus = 'PASS' | 'FAIL' | 'WARN'

export interface DoctorCheck {
  readonly name: string
  readonly status: DoctorCheckStatus
  readonly detail: string
}

export interface DoctorReport {
  readonly blockId: typeof DOCTOR_BLOCK_ID
  readonly checks: readonly DoctorCheck[]
  readonly passCount: number
  readonly failCount: number
  readonly warnCount: number
  readonly healthy: boolean
}

function checkNodeVersion(): DoctorCheck {
  const version = process.version
  const major = Number(version.slice(1).split('.')[0])
  if (major >= 20) {
    return { name: 'Node.js version', status: 'PASS', detail: `${version} (>= 20 required)` }
  }
  return { name: 'Node.js version', status: 'FAIL', detail: `${version} (>= 20 required)` }
}

function checkPackageJson(workspaceRoot: string): DoctorCheck {
  const pkgPath = path.join(workspaceRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return { name: 'package.json', status: 'FAIL', detail: 'Not found' }
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; version?: string }
    if (pkg.name === 'codemind' && typeof pkg.version === 'string') {
      return { name: 'package.json', status: 'PASS', detail: `${pkg.name}@${pkg.version}` }
    }
    return { name: 'package.json', status: 'WARN', detail: `name="${String(pkg.name)}", version="${String(pkg.version)}"` }
  } catch {
    return { name: 'package.json', status: 'FAIL', detail: 'Failed to parse' }
  }
}

function checkNodeModules(workspaceRoot: string): DoctorCheck {
  const nmPath = path.join(workspaceRoot, 'node_modules')
  if (fs.existsSync(nmPath)) {
    return { name: 'Dependencies installed', status: 'PASS', detail: 'node_modules present' }
  }
  return { name: 'Dependencies installed', status: 'FAIL', detail: 'node_modules missing — run npm install' }
}

function checkTsConfig(workspaceRoot: string): DoctorCheck {
  const tsPath = path.join(workspaceRoot, 'tsconfig.json')
  if (fs.existsSync(tsPath)) {
    return { name: 'TypeScript config', status: 'PASS', detail: 'tsconfig.json present' }
  }
  return { name: 'TypeScript config', status: 'FAIL', detail: 'tsconfig.json missing' }
}

function checkRuntimePhases(): DoctorCheck {
  const completed = getCompletedRuntimeBuildPhaseCount()
  const total = RUNTIME_BUILD_PHASES.length
  if (completed === total) {
    return { name: 'Runtime phases', status: 'PASS', detail: `${completed}/${total} complete` }
  }
  return { name: 'Runtime phases', status: 'WARN', detail: `${completed}/${total} complete` }
}

function checkSafetyPosture(): DoctorCheck {
  const snap = getCodemindFoundationSnapshot()
  const violations: string[] = []
  if (snap.mutationEnabled) violations.push('mutation')
  if (snap.githubWriteEnabled) violations.push('githubWrite')
  if (snap.bashExecutionEnabled) violations.push('bashExecution')
  if (snap.networkIngestionEnabled) violations.push('networkIngestion')

  if (violations.length === 0) {
    return { name: 'Safety posture', status: 'PASS', detail: 'All gates locked (mutation, GitHub write, bash, network)' }
  }
  return { name: 'Safety posture', status: 'WARN', detail: `Enabled: ${violations.join(', ')}` }
}

function checkSourceDirectory(workspaceRoot: string): DoctorCheck {
  const srcPath = path.join(workspaceRoot, 'src')
  if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
    return { name: 'Source directory', status: 'PASS', detail: 'src/ present' }
  }
  return { name: 'Source directory', status: 'FAIL', detail: 'src/ missing' }
}

export function runDoctor(workspaceRoot: string): DoctorReport {
  const checks: DoctorCheck[] = [
    checkNodeVersion(),
    checkPackageJson(workspaceRoot),
    checkNodeModules(workspaceRoot),
    checkTsConfig(workspaceRoot),
    checkSourceDirectory(workspaceRoot),
    checkRuntimePhases(),
    checkSafetyPosture(),
  ]

  const passCount = checks.filter((c) => c.status === 'PASS').length
  const failCount = checks.filter((c) => c.status === 'FAIL').length
  const warnCount = checks.filter((c) => c.status === 'WARN').length

  return {
    blockId: DOCTOR_BLOCK_ID,
    checks,
    passCount,
    failCount,
    warnCount,
    healthy: failCount === 0,
  }
}

export function renderDoctorReport(report: DoctorReport): string {
  const statusIcon = (s: DoctorCheckStatus): string => {
    switch (s) {
      case 'PASS': return '[PASS]'
      case 'FAIL': return '[FAIL]'
      case 'WARN': return '[WARN]'
    }
  }

  const lines = [
    'CodeMind Doctor',
    '',
    `Block: ${report.blockId}`,
    `Health: ${report.healthy ? 'HEALTHY' : 'UNHEALTHY'}`,
    '',
    'Checks:',
    ...report.checks.map((c) => `  ${statusIcon(c.status)} ${c.name}: ${c.detail}`),
    '',
    `Summary: ${report.passCount} passed, ${report.failCount} failed, ${report.warnCount} warnings`,
  ]

  return lines.join('\n')
}

export function renderDoctorCommand(workspaceRoot: string): string {
  const report = runDoctor(workspaceRoot)
  return renderDoctorReport(report)
}
