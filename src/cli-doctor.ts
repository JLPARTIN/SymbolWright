import fs from 'node:fs'
import path from 'node:path'

import {
  getCompletedRuntimeBuildPhaseCount,
  RUNTIME_BUILD_PHASES,
} from './runtime/runtime-build-state.js'
import { resolveCodemindConfig, validateCodemindConfig } from './config/codemind-config.js'
import { assembleAgentTools } from './runtime/tools/tool-assembly.js'
import { resolveStoragePaths } from './storage/storage-paths.js'

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
    return {
      name: 'package.json',
      status: 'WARN',
      detail: `name="${String(pkg.name)}", version="${String(pkg.version)}"`,
    }
  } catch {
    return { name: 'package.json', status: 'FAIL', detail: 'Failed to parse' }
  }
}

function checkNodeModules(workspaceRoot: string): DoctorCheck {
  const nmPath = path.join(workspaceRoot, 'node_modules')
  if (fs.existsSync(nmPath)) {
    return { name: 'Dependencies installed', status: 'PASS', detail: 'node_modules present' }
  }
  return {
    name: 'Dependencies installed',
    status: 'FAIL',
    detail: 'node_modules missing — run npm install',
  }
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
  const completed = getCompletedRuntimeBuildPhaseCount()
  const total = RUNTIME_BUILD_PHASES.length

  if (completed === total) {
    return {
      name: 'Safety posture',
      status: 'PASS',
      detail: `${completed}/${total} runtime phases complete`,
    }
  }
  return {
    name: 'Safety posture',
    status: 'WARN',
    detail: `${completed}/${total} runtime phases complete`,
  }
}

function checkSourceDirectory(workspaceRoot: string): DoctorCheck {
  const srcPath = path.join(workspaceRoot, 'src')
  if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
    return { name: 'Source directory', status: 'PASS', detail: 'src/ present' }
  }
  return { name: 'Source directory', status: 'FAIL', detail: 'src/ missing' }
}

function checkApiKey(): DoctorCheck {
  const config = resolveCodemindConfig()
  const validation = validateCodemindConfig(config)
  if (validation.redactedSummary.hasApiKey) {
    return {
      name: 'API key',
      status: 'PASS',
      detail: `Present (${validation.redactedSummary.apiKeyPreview ?? 'set'})`,
    }
  }
  return {
    name: 'API key',
    status: 'WARN',
    detail: 'Missing — set ANTHROPIC_API_KEY or add to config',
  }
}

function checkToolRegistry(): DoctorCheck {
  const tools = assembleAgentTools()
  if (tools.length >= 30) {
    return { name: 'Tool registry', status: 'PASS', detail: `${tools.length} tools registered` }
  }
  return {
    name: 'Tool registry',
    status: 'WARN',
    detail: `Only ${tools.length} tools (expected 30+)`,
  }
}

function checkSessionsDir(workspaceRoot: string): DoctorCheck {
  const paths = resolveStoragePaths(workspaceRoot)
  if (fs.existsSync(paths.sessionsDir)) {
    return { name: 'Sessions directory', status: 'PASS', detail: paths.sessionsDir }
  }
  return {
    name: 'Sessions directory',
    status: 'WARN',
    detail: 'Not yet created (will be on first run)',
  }
}

function checkWorkspaceConfig(workspaceRoot: string): DoctorCheck {
  const configPath = path.join(workspaceRoot, '.codemind', 'workspace.json')
  if (!fs.existsSync(configPath)) {
    return { name: 'Workspace config', status: 'WARN', detail: 'No .codemind/workspace.json found' }
  }
  try {
    JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return { name: 'Workspace config', status: 'PASS', detail: configPath }
  } catch {
    return {
      name: 'Workspace config',
      status: 'FAIL',
      detail: 'Invalid JSON in .codemind/workspace.json',
    }
  }
}

function checkMemoryDir(workspaceRoot: string): DoctorCheck {
  const memDir = path.join(workspaceRoot, '.codemind', 'memory')
  if (fs.existsSync(memDir)) {
    return { name: 'Project memory', status: 'PASS', detail: memDir }
  }
  return {
    name: 'Project memory',
    status: 'WARN',
    detail: 'Not yet created (will be on first run)',
  }
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
    checkApiKey(),
    checkToolRegistry(),
    checkSessionsDir(workspaceRoot),
    checkMemoryDir(workspaceRoot),
    checkWorkspaceConfig(workspaceRoot),
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
      case 'PASS':
        return '[PASS]'
      case 'FAIL':
        return '[FAIL]'
      case 'WARN':
        return '[WARN]'
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
