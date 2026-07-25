import fs from 'node:fs'
import path from 'node:path'

import {
  getCompletedRuntimeBuildPhaseCount,
  RUNTIME_BUILD_PHASES,
} from './runtime/runtime-build-state.js'
import { checkBuildLedgerConsistency } from './build-state/symbolwright-build-ledger.js'
import { runDoctor, type DoctorReport } from './cli-doctor.js'
import { buildUniversalApiContractReport } from './api/universal-api-contract.js'
import { buildProviderAdapterContractReport } from './providers/provider-adapter-contract.js'
import { assessBrowserWorkspaceReadiness } from './workspace/browser-workspace-contract.js'
import { assessRuntimeModeTruth } from './runtime/runtime-mode-truth-gate.js'

export const RELEASE_READINESS_BLOCK_ID = 'SYMBOLWRIGHT-RELEASE-01' as const

export type ReleaseReadinessOutcome = 'RELEASE_READY' | 'RELEASE_BLOCKED'

export type ReleaseGateCode =
  | 'PHASES_COMPLETE'
  | 'DOCTOR_HEALTHY'
  | 'PACKAGE_VERSION'
  | 'CHANGELOG_CURRENT'
  | 'ENTRY_POINT'
  | 'INDEX_EXPORTS'
  | 'CLI_ENTRY'
  | 'DOCKERFILE'
  | 'PUBLIC_API_CONTRACT'
  | 'PACKAGE_BIN_CONTRACT'
  | 'PACKAGE_LOCK_CONTRACT'
  | 'UNIVERSAL_API_GATEWAY_CONTRACT'
  | 'RUNTIME_MODE_TRUTH'
  | 'VALIDATE_SCRIPT'
  | 'WORKFLOW_RELEASE_PROOF'
  | 'BUILD_LEDGER_CONSISTENT'

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

interface PackageJson {
  readonly name?: string
  readonly version?: string
  readonly license?: string
  readonly main?: string
  readonly types?: string
  readonly exports?: {
    readonly '.': {
      readonly import?: string
      readonly types?: string
    }
    readonly './universal-api'?: {
      readonly import?: string
      readonly types?: string
    }
  }
  readonly bin?: Record<string, string>
  readonly scripts?: Record<string, string>
}

interface PackageLockRoot {
  readonly name?: string
  readonly version?: string
  readonly license?: string
  readonly bin?: Record<string, string>
}

interface PackageLockJson {
  readonly name?: string
  readonly version?: string
  readonly packages?: Record<string, PackageLockRoot>
}

function readPackageJson(workspaceRoot: string): PackageJson {
  const pkgPath = path.join(workspaceRoot, 'package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson
}

function readPackageLockJson(workspaceRoot: string): PackageLockJson {
  const lockPath = path.join(workspaceRoot, 'package' + '-lock.json')
  return JSON.parse(fs.readFileSync(lockPath, 'utf8')) as PackageLockJson
}

/** Order-independent bin-map equality -- npm doesn't guarantee key order in package-lock.json matches package.json. */
function binMapsMatch(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const aEntries = Object.entries(a ?? {}).sort(([x], [y]) => x.localeCompare(y))
  const bEntries = Object.entries(b ?? {}).sort(([x], [y]) => x.localeCompare(y))
  if (aEntries.length !== bEntries.length) return false
  return aEntries.every(([key, value], index) => {
    const other = bEntries[index]
    return other !== undefined && other[0] === key && other[1] === value
  })
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
    const pkg = readPackageJson(workspaceRoot)
    if (typeof pkg.version === 'string' && pkg.version.length > 0) {
      return {
        code: 'PACKAGE_VERSION',
        status: 'PASS',
        detail: `v${pkg.version}`,
      }
    }
    return {
      code: 'PACKAGE_VERSION',
      status: 'FAIL',
      detail: 'Missing version in package.json',
    }
  } catch {
    return {
      code: 'PACKAGE_VERSION',
      status: 'FAIL',
      detail: 'Cannot read package.json',
    }
  }
}

function checkChangelogCurrent(workspaceRoot: string): ReleaseGate {
  try {
    const pkg = readPackageJson(workspaceRoot)
    const version = pkg.version ?? ''

    const changelogPath = path.join(workspaceRoot, 'CHANGELOG.md')
    if (!fs.existsSync(changelogPath)) {
      return {
        code: 'CHANGELOG_CURRENT',
        status: 'FAIL',
        detail: 'CHANGELOG.md missing',
      }
    }
    const content = fs.readFileSync(changelogPath, 'utf8')
    if (content.includes(`[${version}]`)) {
      return {
        code: 'CHANGELOG_CURRENT',
        status: 'PASS',
        detail: `CHANGELOG.md contains v${version} entry`,
      }
    }
    return {
      code: 'CHANGELOG_CURRENT',
      status: 'FAIL',
      detail: `CHANGELOG.md missing entry for v${version}`,
    }
  } catch {
    return {
      code: 'CHANGELOG_CURRENT',
      status: 'FAIL',
      detail: 'Cannot verify CHANGELOG consistency',
    }
  }
}

function checkEntryPoint(workspaceRoot: string): ReleaseGate {
  const entryPath = path.join(workspaceRoot, 'src', 'index.ts')
  if (fs.existsSync(entryPath)) {
    return {
      code: 'ENTRY_POINT',
      status: 'PASS',
      detail: 'src/index.ts present',
    }
  }
  return {
    code: 'ENTRY_POINT',
    status: 'FAIL',
    detail: 'src/index.ts missing',
  }
}

function checkIndexExports(workspaceRoot: string): ReleaseGate {
  try {
    const indexPath = path.join(workspaceRoot, 'src', 'index.ts')
    const content = fs.readFileSync(indexPath, 'utf8')
    const exportCount = (content.match(/^export /gm) ?? []).length
    if (exportCount > 0) {
      return {
        code: 'INDEX_EXPORTS',
        status: 'PASS',
        detail: `${exportCount} export statement(s)`,
      }
    }
    return {
      code: 'INDEX_EXPORTS',
      status: 'FAIL',
      detail: 'No exports found in index.ts',
    }
  } catch {
    return {
      code: 'INDEX_EXPORTS',
      status: 'FAIL',
      detail: 'Cannot read index.ts',
    }
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

function checkPublicApiContract(workspaceRoot: string): ReleaseGate {
  try {
    const pkg = readPackageJson(workspaceRoot)
    const rootExport = pkg.exports?.['.']
    const universalApiExport = pkg.exports?.['./universal-api']
    const issues: string[] = []

    if (pkg.name !== 'symbolwright') {
      issues.push('package name must be symbolwright')
    }
    if (pkg.main !== 'dist/index.js') {
      issues.push('main must resolve to dist/index.js')
    }
    if (pkg.types !== 'dist/index.d.ts') {
      issues.push('types must resolve to dist/index.d.ts')
    }
    if (rootExport?.import !== './dist/index.js') {
      issues.push('root export import must resolve to ./dist/index.js')
    }
    if (rootExport?.types !== './dist/index.d.ts') {
      issues.push('root export types must resolve to ./dist/index.d.ts')
    }
    if (universalApiExport?.import !== './dist/universal-api.js') {
      issues.push('universal API export import must resolve to ./dist/universal-api.js')
    }
    if (universalApiExport?.types !== './dist/universal-api.d.ts') {
      issues.push('universal API export types must resolve to ./dist/universal-api.d.ts')
    }

    return {
      code: 'PUBLIC_API_CONTRACT',
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      detail:
        issues.length === 0
          ? 'Package root and universal API exports resolve to dist entry points'
          : issues.join('; '),
    }
  } catch {
    return {
      code: 'PUBLIC_API_CONTRACT',
      status: 'FAIL',
      detail: 'Cannot verify package public API contract',
    }
  }
}

function checkPackageBinContract(workspaceRoot: string): ReleaseGate {
  try {
    const pkg = readPackageJson(workspaceRoot)
    const requiredBins = [
      {
        name: 'symbolwright',
        dist: 'dist/cli.js',
        source: path.join('src', 'cli.ts'),
      },
      {
        name: 'symbolwright-workspace',
        dist: 'dist/cli-workspace-bin.js',
        source: path.join('src', 'cli-workspace-bin.ts'),
      },
      {
        name: 'codemind',
        dist: 'dist/cli.js',
        source: path.join('src', 'cli.ts'),
      },
      {
        name: 'codemind-workspace',
        dist: 'dist/cli-workspace-bin.js',
        source: path.join('src', 'cli-workspace-bin.ts'),
      },
    ]
    const issues: string[] = []

    for (const bin of requiredBins) {
      if (pkg.bin?.[bin.name] !== bin.dist) {
        issues.push(`${bin.name} bin must resolve to ${bin.dist}`)
      }
      if (!fs.existsSync(path.join(workspaceRoot, bin.source))) {
        issues.push(`${bin.name} source file missing at ${bin.source}`)
      }
    }

    return {
      code: 'PACKAGE_BIN_CONTRACT',
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      detail:
        issues.length === 0
          ? 'Package binaries map to built CLI entry points with source parity'
          : issues.join('; '),
    }
  } catch {
    return {
      code: 'PACKAGE_BIN_CONTRACT',
      status: 'FAIL',
      detail: 'Cannot verify package binary contract',
    }
  }
}

function checkPackageLockContract(workspaceRoot: string): ReleaseGate {
  try {
    const pkg = readPackageJson(workspaceRoot)
    const lock = readPackageLockJson(workspaceRoot)
    const root = lock.packages?.['']
    const issues: string[] = []

    if (pkg.license !== 'MIT') {
      issues.push('package.json license must be MIT')
    }
    if (root?.license !== pkg.license) {
      issues.push('install plan root license must match package.json license')
    }
    if (lock.name !== pkg.name) {
      issues.push('install plan top-level name must match package.json name')
    }
    if (lock.version !== pkg.version) {
      issues.push('install plan top-level version must match package.json version')
    }
    if (root?.name !== pkg.name) {
      issues.push('install plan root name must match package.json name')
    }
    if (root?.version !== pkg.version) {
      issues.push('install plan root version must match package.json version')
    }
    if (!binMapsMatch(root?.bin, pkg.bin)) {
      issues.push('install plan root bin map must match package.json bin map')
    }

    return {
      code: 'PACKAGE_LOCK_CONTRACT',
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      detail:
        issues.length === 0
          ? 'Package install plan root metadata matches package.json'
          : issues.join('; '),
    }
  } catch {
    return {
      code: 'PACKAGE_LOCK_CONTRACT',
      status: 'FAIL',
      detail: 'Cannot verify package install plan metadata contract',
    }
  }
}

function checkUniversalApiGatewayContract(workspaceRoot: string): ReleaseGate {
  const issues: string[] = []
  const requiredPaths = [
    path.join('src', 'api', 'universal-api-contract.ts'),
    path.join('src', 'providers', 'provider-adapter-contract.ts'),
    path.join('src', 'workspace', 'browser-workspace-contract.ts'),
    path.join('src', 'universal-api.ts'),
    path.join('docs', 'API_REFERENCE.md'),
    path.join('docs', 'PROVIDER_KEYS.md'),
    path.join('docs', 'BROWSER_WORKSPACE.md'),
    path.join('docs', 'USING_SYMBOLWRIGHT_FROM_ANY_LLM.md'),
  ]

  for (const requiredPath of requiredPaths) {
    if (!fs.existsSync(path.join(workspaceRoot, requiredPath))) {
      issues.push(`${requiredPath} missing`)
    }
  }

  const apiReport = buildUniversalApiContractReport()
  const providerReport = buildProviderAdapterContractReport()
  const workspaceReport = assessBrowserWorkspaceReadiness()

  if (apiReport.status !== 'READY') {
    issues.push(`universal API contract blocked: ${apiReport.findings.join('; ')}`)
  }
  if (providerReport.status !== 'READY') {
    issues.push('provider adapter contract blocked')
  }
  if (workspaceReport.status !== 'READY') {
    issues.push(`browser workspace contract blocked: ${workspaceReport.findings.join('; ')}`)
  }

  return {
    code: 'UNIVERSAL_API_GATEWAY_CONTRACT',
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    detail:
      issues.length === 0
        ? 'Universal API, provider adapter, browser workspace, and docs contracts are present and ready'
        : issues.join('; '),
  }
}

function checkRuntimeModeTruth(workspaceRoot: string): ReleaseGate {
  const report = assessRuntimeModeTruth(workspaceRoot)

  return {
    code: 'RUNTIME_MODE_TRUTH',
    status: report.status,
    detail:
      report.status === 'PASS'
        ? 'Runtime policy, prompt, README, and governance docs agree on direct APPROVED_EXECUTION behavior'
        : report.findings.join('; '),
  }
}

function checkValidateScript(workspaceRoot: string): ReleaseGate {
  try {
    const pkg = readPackageJson(workspaceRoot)
    const validateScript = pkg.scripts?.['validate'] ?? ''
    const requiredCommands = [
      'npm run audit',
      'npm run typecheck',
      'npm run lint',
      'npm run format:check',
      'npm run test:coverage',
      'npm run build',
      'npm run release-readiness',
    ]
    const missing = requiredCommands.filter((command) => !validateScript.includes(command))

    return {
      code: 'VALIDATE_SCRIPT',
      status: missing.length === 0 ? 'PASS' : 'FAIL',
      detail:
        missing.length === 0
          ? 'npm run validate covers audit, typecheck, lint, format, coverage, build, and release-readiness'
          : `validate script missing: ${missing.join(', ')}`,
    }
  } catch {
    return {
      code: 'VALIDATE_SCRIPT',
      status: 'FAIL',
      detail: 'Cannot verify validate script',
    }
  }
}

function checkWorkflowReleaseProof(workspaceRoot: string): ReleaseGate {
  const workflowPaths = [
    path.join('.github', 'workflows', 'ci.yml'),
    path.join('.github', 'workflows', 'deploy.yml'),
    path.join('.github', 'workflows', 'publish.yml'),
  ]
  const issues: string[] = []

  for (const workflowPath of workflowPaths) {
    const absolutePath = path.join(workspaceRoot, workflowPath)
    if (!fs.existsSync(absolutePath)) {
      issues.push(`${workflowPath} missing`)
      continue
    }

    const content = fs.readFileSync(absolutePath, 'utf8')
    if (!content.includes('npm run validate')) {
      issues.push(`${workflowPath} missing npm run validate release proof gate`)
    }
  }

  return {
    code: 'WORKFLOW_RELEASE_PROOF',
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    detail:
      issues.length === 0
        ? 'CI, deploy, and publish workflows run the validate release proof gate'
        : issues.join('; '),
  }
}

function checkBuildLedgerConsistent(workspaceRoot: string): ReleaseGate {
  try {
    const readmePath = path.join(workspaceRoot, 'README.md')
    const runtimeDocsPath = path.join(
      workspaceRoot,
      'docs',
      'runtime',
      'SYMBOLWRIGHT_RUNTIME_BUILD_STATE.md',
    )

    if (!fs.existsSync(readmePath)) {
      return {
        code: 'BUILD_LEDGER_CONSISTENT',
        status: 'FAIL',
        detail: 'README.md missing',
      }
    }
    if (!fs.existsSync(runtimeDocsPath)) {
      return {
        code: 'BUILD_LEDGER_CONSISTENT',
        status: 'FAIL',
        detail: 'docs/runtime/SYMBOLWRIGHT_RUNTIME_BUILD_STATE.md missing',
      }
    }

    const report = checkBuildLedgerConsistency(
      fs.readFileSync(readmePath, 'utf8'),
      fs.readFileSync(runtimeDocsPath, 'utf8'),
    )

    return {
      code: 'BUILD_LEDGER_CONSISTENT',
      status: report.status === 'CONSISTENT' ? 'PASS' : 'FAIL',
      detail:
        report.status === 'CONSISTENT'
          ? 'README and runtime build docs match the runtime build ledger'
          : report.findings.map((finding) => `${finding.source}: ${finding.issue}`).join('; '),
    }
  } catch {
    return {
      code: 'BUILD_LEDGER_CONSISTENT',
      status: 'FAIL',
      detail: 'Cannot verify build ledger source-of-truth consistency',
    }
  }
}

export function assessReleaseReadiness(workspaceRoot: string): ReleaseReadinessReport {
  const doctorReport = runDoctor(workspaceRoot)

  const gates: ReleaseGate[] = [
    checkAllPhasesComplete(),
    checkDoctorHealthy(doctorReport),
    checkPackageVersion(workspaceRoot),
    checkChangelogCurrent(workspaceRoot),
    checkEntryPoint(workspaceRoot),
    checkIndexExports(workspaceRoot),
    checkCliEntry(workspaceRoot),
    checkDockerfile(workspaceRoot),
    checkPublicApiContract(workspaceRoot),
    checkPackageBinContract(workspaceRoot),
    checkPackageLockContract(workspaceRoot),
    checkUniversalApiGatewayContract(workspaceRoot),
    checkRuntimeModeTruth(workspaceRoot),
    checkValidateScript(workspaceRoot),
    checkWorkflowReleaseProof(workspaceRoot),
    checkBuildLedgerConsistent(workspaceRoot),
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
    'SymbolWright Release Readiness',
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
