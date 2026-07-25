import fs from 'node:fs'
import path from 'node:path'

import {
  createBuildLedgerSummary,
  type BuildLedgerSummary,
} from '../build-state/symbolwright-build-ledger.js'
import { loadProjectInstructionSet } from './project-instructions-loader.js'
import type { ProjectInstructionSet } from './project-instructions.js'

export interface PackageScriptEntry {
  readonly name: string
  readonly command: string
}

export interface WorkflowEntry {
  readonly fileName: string
  readonly exists: boolean
}

export interface ProjectContextPacket {
  readonly rootDir: string
  readonly instructionSet: ProjectInstructionSet
  readonly buildLedger: BuildLedgerSummary
  readonly packageScripts: readonly PackageScriptEntry[]
  readonly workflows: readonly WorkflowEntry[]
  readonly docsPresent: readonly string[]
  readonly operatorDirectives: readonly string[]
  readonly riskBoundaries: readonly string[]
  readonly validationCommands: readonly string[]
  readonly generatedAt: string
}

const KNOWN_WORKFLOW_FILES = [
  '.github/workflows/ci.yml',
  '.github/workflows/ci.yaml',
  '.github/workflows/deploy.yml',
  '.github/workflows/deploy.yaml',
]

const DOCS_SCAN_DIRS = ['docs/roadmap', 'docs/pr-plans']

const PROTECTED_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.env'])

const DEFAULT_RISK_BOUNDARIES = [
  'no auto-merge',
  'no auto-approve',
  'no force push',
  'no unbounded shell',
  'no secret access',
  'no silent background execution',
]

const DEFAULT_OPERATOR_DIRECTIVES = [
  'plan-first by default',
  'read-only before writes',
  'approval ticket required for mutations',
  'protected paths always blocked',
]

function loadPackageScripts(rootDir: string): readonly PackageScriptEntry[] {
  const pkgPath = path.resolve(rootDir, 'package.json')
  try {
    const content = fs.readFileSync(pkgPath, 'utf8')
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
      return []
    }
    const scripts = (parsed as { scripts?: Record<string, unknown> }).scripts
    if (typeof scripts !== 'object' || scripts === null) {
      return []
    }
    return Object.entries(scripts)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([name, command]) => ({ name, command }))
  } catch {
    return []
  }
}

function loadWorkflows(rootDir: string): readonly WorkflowEntry[] {
  return KNOWN_WORKFLOW_FILES.map((fileName) => {
    const filePath = path.resolve(rootDir, fileName)
    let exists = false
    try {
      exists = fs.existsSync(filePath)
    } catch {
      exists = false
    }
    return { fileName, exists }
  })
}

function scanDocsDir(rootDir: string, relDir: string): readonly string[] {
  const fullDir = path.resolve(rootDir, relDir)
  if (PROTECTED_DIRS.has(path.basename(fullDir))) {
    return []
  }
  try {
    if (!fs.existsSync(fullDir)) {
      return []
    }
    const entries = fs.readdirSync(fullDir)
    return entries.filter((e) => e.endsWith('.md')).map((e) => path.join(relDir, e))
  } catch {
    return []
  }
}

export function buildProjectContextPacket(rootDir: string): ProjectContextPacket {
  const instructionSet = loadProjectInstructionSet(rootDir)
  const buildLedger = createBuildLedgerSummary()
  const packageScripts = loadPackageScripts(rootDir)
  const workflows = loadWorkflows(rootDir)
  const docsPresent = DOCS_SCAN_DIRS.flatMap((dir) => scanDocsDir(rootDir, dir))

  const validationCommands = packageScripts
    .filter((s) =>
      ['typecheck', 'test', 'test:coverage', 'lint', 'audit', 'build', 'build:app'].includes(
        s.name,
      ),
    )
    .map((s) => `npm run ${s.name}`)

  return {
    rootDir: path.resolve(rootDir),
    instructionSet,
    buildLedger,
    packageScripts,
    workflows,
    docsPresent,
    operatorDirectives: DEFAULT_OPERATOR_DIRECTIVES,
    riskBoundaries: DEFAULT_RISK_BOUNDARIES,
    validationCommands,
    generatedAt: new Date().toISOString(),
  }
}

export function renderProjectContextPacket(packet: ProjectContextPacket): string {
  const lines = [
    'SymbolWright Project Context Packet',
    '',
    `Root: ${packet.rootDir}`,
    `Generated: ${packet.generatedAt}`,
    '',
    '--- Instructions ---',
    `Found: ${packet.instructionSet.foundCount}`,
    `Missing: ${packet.instructionSet.missingCount}`,
    ...packet.instructionSet.instructions.map((inst) =>
      inst.exists ? `  ${inst.fileName}: ${inst.lineCount} lines` : `  ${inst.fileName}: NOT FOUND`,
    ),
    '',
    '--- Build State ---',
    `Phases: ${packet.buildLedger.completedPhases}/${packet.buildLedger.totalPhases} complete`,
    `Next: ${packet.buildLedger.nextPhase ?? 'none'}`,
    '',
    '--- Package Scripts ---',
    ...packet.packageScripts.map((s) => `  ${s.name}: ${s.command}`),
    '',
    '--- Workflows ---',
    ...packet.workflows.map((w) => `  ${w.fileName}: ${w.exists ? 'FOUND' : 'NOT FOUND'}`),
    '',
    '--- Docs Present ---',
    ...(packet.docsPresent.length > 0 ? packet.docsPresent.map((d) => `  ${d}`) : ['  (none)']),
    '',
    '--- Operator Directives ---',
    ...packet.operatorDirectives.map((d) => `  ${d}`),
    '',
    '--- Risk Boundaries ---',
    ...packet.riskBoundaries.map((r) => `  ${r}`),
    '',
    '--- Validation Commands ---',
    ...(packet.validationCommands.length > 0
      ? packet.validationCommands.map((v) => `  ${v}`)
      : ['  (none)']),
  ]
  return lines.join('\n')
}
