import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export type RepositoryEcosystem =
  | 'node'
  | 'python'
  | 'go'
  | 'rust'
  | 'java-maven'
  | 'java-gradle'
  | 'dotnet'
  | 'ruby'
  | 'php'
  | 'unknown'

export interface RepositoryValidationCommand {
  readonly command: string
  readonly ecosystem: RepositoryEcosystem
  readonly phase: 'format' | 'lint' | 'typecheck' | 'test' | 'build' | 'audit'
  readonly source: 'manifest' | 'convention' | 'ci-workflow'
  readonly workingDirectory: string
  readonly sandboxImage: string
}

export interface RepositoryPortabilityProfile {
  readonly schemaVersion: 1
  readonly repositoryRoot: string
  readonly ecosystems: readonly RepositoryEcosystem[]
  readonly primaryEcosystem: RepositoryEcosystem
  readonly mixed: boolean
  readonly manifests: readonly string[]
  readonly validation: readonly RepositoryValidationCommand[]
  readonly validationCommands: readonly string[]
  readonly confidence: 'high' | 'medium' | 'low'
  readonly researchQueries: readonly string[]
  readonly evidence: readonly string[]
}

export interface RepositoryPortabilityDiscoveryOptions {
  readonly maxFiles?: number
  readonly maxDepth?: number
}

interface RepositoryInventory {
  readonly files: readonly string[]
  readonly manifests: readonly string[]
  readonly extensionCounts: ReadonlyMap<string, number>
}

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.codemind',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  '.idea',
  '.next',
  'vendor',
])

const MANIFEST_NAMES = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'setup.cfg',
  'tox.ini',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'gradlew',
  'mvnw',
  'Gemfile',
  'composer.json',
  'global.json',
])

const IMAGE_BY_ECOSYSTEM: Readonly<Record<RepositoryEcosystem, string>> = {
  node: 'node:22-bookworm',
  python: 'python:3.12-bookworm',
  go: 'golang:1-bookworm',
  rust: 'rust:1-bookworm',
  'java-maven': 'maven:3-eclipse-temurin-21',
  'java-gradle': 'gradle:8-jdk21',
  dotnet: 'mcr.microsoft.com/dotnet/sdk:8.0',
  ruby: 'ruby:3.3-bookworm',
  php: 'composer:2',
  unknown: 'node:22-bookworm',
}

export async function discoverRepositoryPortability(
  repositoryRoot: string,
  options: RepositoryPortabilityDiscoveryOptions = {},
): Promise<RepositoryPortabilityProfile> {
  const root = path.resolve(repositoryRoot)
  const inventory = await inventoryRepository(root, options)
  const ecosystems = detectEcosystems(inventory)
  const manifests = [...inventory.manifests].sort()
  const validation = await discoverValidation(root, ecosystems, manifests, inventory.files)
  const primaryEcosystem = ecosystems[0] ?? 'unknown'
  const evidence = buildEvidence(ecosystems, manifests, validation)
  const researchQueries = researchQueriesFor(ecosystems, validation, manifests)

  return {
    schemaVersion: 1,
    repositoryRoot: root,
    ecosystems: ecosystems.length === 0 ? ['unknown'] : ecosystems,
    primaryEcosystem,
    mixed: ecosystems.length > 1,
    manifests,
    validation,
    validationCommands: validation.map((entry) => entry.command),
    confidence:
      manifests.length > 0 && validation.length > 0
        ? 'high'
        : ecosystems.length > 0
          ? 'medium'
          : 'low',
    researchQueries,
    evidence,
  }
}

export function sandboxImageForValidationCommand(command: string): string {
  const trimmed = command.trim()
  if (/^(npm|npx|node|prettier)\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM.node
  if (/^(python|python3|pytest)\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM.python
  if (/^go\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM.go
  if (/^cargo\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM.rust
  if (/^(mvn|\.\/mvnw)\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM['java-maven']
  if (/^(gradle|\.\/gradlew)\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM['java-gradle']
  if (/^dotnet\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM.dotnet
  if (/^(ruby|bundle|rake)\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM.ruby
  if (/^(php|composer)\b/.test(trimmed)) return IMAGE_BY_ECOSYSTEM.php
  return IMAGE_BY_ECOSYSTEM.unknown
}

async function inventoryRepository(
  root: string,
  options: RepositoryPortabilityDiscoveryOptions,
): Promise<RepositoryInventory> {
  const maxFiles = options.maxFiles ?? 20_000
  const maxDepth = options.maxDepth ?? 8
  const files: string[] = []
  const manifests: string[] = []
  const extensionCounts = new Map<string, number>()

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth || files.length >= maxFiles) return
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= maxFiles) return
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).replaceAll('\\', '/')
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolute, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      files.push(relative)
      const extension = path.extname(entry.name).toLowerCase()
      if (extension.length > 0)
        extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1)
      if (MANIFEST_NAMES.has(entry.name) || /\.(?:sln|csproj|fsproj|vbproj)$/.test(entry.name)) {
        manifests.push(relative)
      }
    }
  }

  await walk(root, 0)
  return { files, manifests, extensionCounts }
}

function detectEcosystems(inventory: RepositoryInventory): RepositoryEcosystem[] {
  const names = new Set(inventory.manifests.map((entry) => path.posix.basename(entry)))
  const detected = new Set<RepositoryEcosystem>()
  if (names.has('package.json')) detected.add('node')
  if (
    [...names].some((name) =>
      ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'tox.ini'].includes(name),
    )
  )
    detected.add('python')
  if (names.has('go.mod')) detected.add('go')
  if (names.has('Cargo.toml')) detected.add('rust')
  if (names.has('pom.xml') || names.has('mvnw')) detected.add('java-maven')
  if (names.has('build.gradle') || names.has('build.gradle.kts') || names.has('gradlew'))
    detected.add('java-gradle')
  if ([...names].some((name) => /\.(?:sln|csproj|fsproj|vbproj)$/.test(name)))
    detected.add('dotnet')
  if (names.has('Gemfile')) detected.add('ruby')
  if (names.has('composer.json')) detected.add('php')

  const extensionSignals: readonly [string, RepositoryEcosystem][] = [
    ['.py', 'python'],
    ['.go', 'go'],
    ['.rs', 'rust'],
    ['.java', 'java-maven'],
    ['.cs', 'dotnet'],
    ['.rb', 'ruby'],
    ['.php', 'php'],
    ['.ts', 'node'],
    ['.tsx', 'node'],
    ['.js', 'node'],
  ]
  for (const [extension, ecosystem] of extensionSignals) {
    if ((inventory.extensionCounts.get(extension) ?? 0) >= 2) detected.add(ecosystem)
  }

  return [...detected].sort((left, right) => ecosystemPriority(left) - ecosystemPriority(right))
}

async function discoverValidation(
  root: string,
  ecosystems: readonly RepositoryEcosystem[],
  manifests: readonly string[],
  files: readonly string[],
): Promise<RepositoryValidationCommand[]> {
  const commands: RepositoryValidationCommand[] = []
  if (ecosystems.includes('node')) commands.push(...(await nodeCommands(root, manifests)))
  if (ecosystems.includes('python')) commands.push(...pythonCommands(manifests))
  if (ecosystems.includes('go'))
    commands.push(
      ...conventional('go', '.', [
        ['format', 'gofmt -l .'],
        ['lint', 'go vet ./...'],
        ['test', 'go test ./...'],
        ['build', 'go build ./...'],
      ]),
    )
  if (ecosystems.includes('rust'))
    commands.push(
      ...conventional('rust', '.', [
        ['format', 'cargo fmt --check'],
        ['lint', 'cargo clippy --all-targets --all-features -- -D warnings'],
        ['test', 'cargo test --all'],
        ['build', 'cargo build --all'],
      ]),
    )
  if (ecosystems.includes('java-maven')) {
    const wrapper = files.includes('mvnw') ? './mvnw' : 'mvn'
    commands.push(
      ...conventional('java-maven', '.', [
        ['test', `${wrapper} test`],
        ['build', `${wrapper} package -DskipTests`],
      ]),
    )
  }
  if (ecosystems.includes('java-gradle')) {
    const wrapper = files.includes('gradlew') ? './gradlew' : 'gradle'
    commands.push(
      ...conventional('java-gradle', '.', [
        ['test', `${wrapper} test`],
        ['build', `${wrapper} build -x test`],
      ]),
    )
  }
  if (ecosystems.includes('dotnet'))
    commands.push(
      ...conventional('dotnet', '.', [
        ['format', 'dotnet format --verify-no-changes'],
        ['test', 'dotnet test --no-restore'],
        ['build', 'dotnet build --no-restore'],
      ]),
    )
  if (ecosystems.includes('ruby'))
    commands.push(
      ...conventional('ruby', '.', [
        ['lint', 'bundle exec rubocop'],
        ['test', 'bundle exec rspec'],
      ]),
    )
  if (ecosystems.includes('php'))
    commands.push(
      ...conventional('php', '.', [
        ['audit', 'composer validate --strict'],
        ['test', 'composer test'],
      ]),
    )

  commands.push(...(await ciWorkflowCommands(root, files, ecosystems)))
  return dedupeValidation(commands)
}

async function nodeCommands(
  root: string,
  manifests: readonly string[],
): Promise<RepositoryValidationCommand[]> {
  const commands: RepositoryValidationCommand[] = []
  for (const manifest of manifests.filter(
    (entry) => path.posix.basename(entry) === 'package.json',
  )) {
    const workingDirectory =
      path.posix.dirname(manifest) === '.' ? '.' : path.posix.dirname(manifest)
    try {
      const parsed = JSON.parse(await readFile(path.join(root, manifest), 'utf8')) as {
        scripts?: Record<string, unknown>
      }
      const scripts = parsed.scripts ?? {}
      const candidates: readonly [RepositoryValidationCommand['phase'], readonly string[]][] = [
        ['format', ['format:check', 'format-check', 'fmt:check']],
        ['lint', ['lint']],
        ['typecheck', ['typecheck', 'type-check', 'check:types']],
        ['test', ['test']],
        ['build', ['build']],
        ['audit', ['audit']],
      ]
      for (const [phase, names] of candidates) {
        const script = names.find((name) => typeof scripts[name] === 'string')
        if (script !== undefined)
          commands.push(command(`npm run ${script}`, 'node', phase, 'manifest', workingDirectory))
      }
    } catch {
      // Invalid package JSON is surfaced later by validation; discovery stays deterministic.
    }
  }
  return commands
}

function pythonCommands(manifests: readonly string[]): RepositoryValidationCommand[] {
  const names = new Set(manifests.map((entry) => path.posix.basename(entry)))
  const phases: Array<[RepositoryValidationCommand['phase'], string]> = []
  if (names.has('pyproject.toml') || names.has('setup.cfg') || names.has('tox.ini')) {
    phases.push(['lint', 'python -m ruff check .'], ['typecheck', 'python -m mypy .'])
  }
  phases.push(['test', 'python -m pytest'], ['build', 'python -m compileall .'])
  return conventional('python', '.', phases)
}

function conventional(
  ecosystem: RepositoryEcosystem,
  workingDirectory: string,
  commands: readonly [RepositoryValidationCommand['phase'], string][],
): RepositoryValidationCommand[] {
  return commands.map(([phase, value]) =>
    command(value, ecosystem, phase, 'convention', workingDirectory),
  )
}

async function ciWorkflowCommands(
  root: string,
  files: readonly string[],
  ecosystems: readonly RepositoryEcosystem[],
): Promise<RepositoryValidationCommand[]> {
  const commands: RepositoryValidationCommand[] = []
  const workflows = files.filter((entry) => /^\.github\/workflows\/.*\.ya?ml$/.test(entry))
  for (const workflow of workflows) {
    let content: string
    try {
      content = await readFile(path.join(root, workflow), 'utf8')
    } catch {
      continue
    }
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*run:\s*(.+?)\s*$/)
      if (match?.[1] === undefined) continue
      const candidate = stripYamlQuotes(match[1])
      const ecosystem = ecosystemForCommand(candidate)
      if (ecosystem === undefined || !ecosystems.includes(ecosystem)) continue
      const phase = phaseForCommand(candidate)
      if (phase === undefined || !isSafePortableValidationCommand(candidate)) continue
      commands.push(command(candidate, ecosystem, phase, 'ci-workflow', '.'))
    }
  }
  return commands
}

export function isSafePortableValidationCommand(commandValue: string): boolean {
  const value = commandValue.trim()
  if (value.length === 0 || /[;&|`$<>\n\r]/.test(value)) return false
  return [
    /^npm (?:run [a-zA-Z0-9:_-]+|test)$/,
    /^npx (?:vitest|jest|eslint|prettier|tsc)(?: [a-zA-Z0-9_./:@=-]+)*$/,
    /^python3? -m (?:pytest|mypy|ruff|compileall|build)(?: [a-zA-Z0-9_./:@=-]+)*$/,
    /^pytest(?: [a-zA-Z0-9_./:@=-]+)*$/,
    /^go (?:test|vet|build) \.\/\.\.\.$/,
    /^gofmt -l \.$/,
    /^cargo (?:fmt --check|test --all|build --all|clippy --all-targets --all-features -- -D warnings)$/,
    /^(?:mvn|\.\/mvnw) (?:test|package -DskipTests)$/,
    /^(?:gradle|\.\/gradlew) (?:test|build -x test)$/,
    /^dotnet (?:format --verify-no-changes|test --no-restore|build --no-restore)$/,
    /^bundle exec (?:rubocop|rspec)$/,
    /^composer (?:validate --strict|test)$/,
  ].some((pattern) => pattern.test(value))
}

function command(
  value: string,
  ecosystem: RepositoryEcosystem,
  phase: RepositoryValidationCommand['phase'],
  source: RepositoryValidationCommand['source'],
  workingDirectory: string,
): RepositoryValidationCommand {
  return {
    command: value,
    ecosystem,
    phase,
    source,
    workingDirectory,
    sandboxImage: IMAGE_BY_ECOSYSTEM[ecosystem],
  }
}

function dedupeValidation(
  commands: readonly RepositoryValidationCommand[],
): RepositoryValidationCommand[] {
  const seen = new Set<string>()
  return commands.filter((entry) => {
    const key = `${entry.workingDirectory}\u0000${entry.command}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildEvidence(
  ecosystems: readonly RepositoryEcosystem[],
  manifests: readonly string[],
  validation: readonly RepositoryValidationCommand[],
): string[] {
  return [
    `Detected ecosystems: ${ecosystems.length === 0 ? 'unknown' : ecosystems.join(', ')}.`,
    `Detected ${manifests.length} ecosystem manifest(s).`,
    `Discovered ${validation.length} safe validation command(s).`,
    ...validation.map((entry) => `${entry.phase}: ${entry.command} (${entry.source})`),
  ]
}

function researchQueriesFor(
  ecosystems: readonly RepositoryEcosystem[],
  validation: readonly RepositoryValidationCommand[],
  manifests: readonly string[],
): string[] {
  if (ecosystems.length === 0) {
    return [
      `Identify the programming language and standard validation commands for manifests: ${manifests.join(', ') || 'none'}`,
    ]
  }
  const withoutValidation = ecosystems.filter(
    (ecosystem) => !validation.some((entry) => entry.ecosystem === ecosystem),
  )
  return withoutValidation.map(
    (ecosystem) => `Official ${ecosystem} project build test lint typecheck commands`,
  )
}

function ecosystemForCommand(value: string): RepositoryEcosystem | undefined {
  if (/^(npm|npx|node|prettier)\b/.test(value)) return 'node'
  if (/^(python|python3|pytest)\b/.test(value)) return 'python'
  if (/^(go|gofmt)\b/.test(value)) return 'go'
  if (/^cargo\b/.test(value)) return 'rust'
  if (/^(mvn|\.\/mvnw)\b/.test(value)) return 'java-maven'
  if (/^(gradle|\.\/gradlew)\b/.test(value)) return 'java-gradle'
  if (/^dotnet\b/.test(value)) return 'dotnet'
  if (/^(ruby|bundle|rake)\b/.test(value)) return 'ruby'
  if (/^(php|composer)\b/.test(value)) return 'php'
  return undefined
}

function phaseForCommand(value: string): RepositoryValidationCommand['phase'] | undefined {
  if (/format|fmt|gofmt/.test(value)) return 'format'
  if (/lint|ruff|rubocop|clippy|vet/.test(value)) return 'lint'
  if (/type|mypy|tsc/.test(value)) return 'typecheck'
  if (/test|pytest|rspec|phpunit|vitest|jest/.test(value)) return 'test'
  if (/audit|validate/.test(value)) return 'audit'
  if (/build|package|compile/.test(value)) return 'build'
  return undefined
}

function stripYamlQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function ecosystemPriority(ecosystem: RepositoryEcosystem): number {
  return [
    'node',
    'python',
    'go',
    'rust',
    'java-maven',
    'java-gradle',
    'dotnet',
    'ruby',
    'php',
    'unknown',
  ].indexOf(ecosystem)
}
