import { readdir } from 'node:fs/promises'
import path from 'node:path'

import {
  discoverRepositoryPortability,
  type RepositoryEcosystem,
  type RepositoryPortabilityDiscoveryOptions,
  type RepositoryPortabilityProfile,
  type RepositoryValidationCommand,
} from './repository-portability.js'

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
  '.next',
  'vendor',
])

const RESEARCH_MARKERS: Readonly<Record<string, string>> = {
  'build.zig': 'Official Zig build test format lint commands',
  'Package.swift': 'Official Swift Package Manager build test lint commands',
  'pubspec.yaml': 'Official Dart Flutter analyze test build commands',
  'mix.exs': 'Official Elixir Mix format test compile commands',
  'CMakeLists.txt': 'Official CMake C C++ configure build test commands',
  Makefile: 'Project Makefile validation test build targets',
}

export async function discoverUniversalRepositoryPortability(
  repositoryRoot: string,
  options: RepositoryPortabilityDiscoveryOptions = {},
): Promise<RepositoryPortabilityProfile> {
  const [baseProfile, researchMarkers] = await Promise.all([
    discoverRepositoryPortability(repositoryRoot, options),
    findResearchMarkers(repositoryRoot, options.maxDepth ?? 8, options.maxFiles ?? 20_000),
  ])
  const expanded = expandMonorepoValidation({
    ...baseProfile,
    manifests: [...new Set([...baseProfile.manifests, ...researchMarkers])].sort(),
  })
  const targetedQueries = researchMarkers
    .map((marker) => RESEARCH_MARKERS[path.posix.basename(marker)])
    .filter((query): query is string => query !== undefined)

  return {
    ...expanded,
    researchQueries:
      targetedQueries.length === 0
        ? expanded.researchQueries
        : [...new Set([...targetedQueries, ...expanded.researchQueries])],
    evidence: [
      ...expanded.evidence,
      ...(researchMarkers.length === 0
        ? []
        : [`Detected research-only toolchain markers: ${researchMarkers.join(', ')}.`]),
    ],
  }
}

export function expandMonorepoValidation(
  profile: RepositoryPortabilityProfile,
): RepositoryPortabilityProfile {
  const roots = validationRoots(profile.manifests)
  const expanded = profile.validation.flatMap((entry) => expandEntry(entry, roots))
  const validation = dedupe(expanded)
  return {
    ...profile,
    validation,
    validationCommands: validation.map((entry) => entry.command),
    evidence: [
      ...profile.evidence,
      `Expanded validation across ${distinctRoots(validation).length} repository package root(s).`,
    ],
  }
}

function expandEntry(
  entry: RepositoryValidationCommand,
  roots: ReadonlyMap<RepositoryEcosystem, readonly string[]>,
): readonly RepositoryValidationCommand[] {
  if (entry.workingDirectory !== '.' || entry.source !== 'convention') return [entry]
  const ecosystemRoots = roots.get(entry.ecosystem) ?? []
  if (ecosystemRoots.length === 0) return [entry]
  return ecosystemRoots.map((workingDirectory) => ({ ...entry, workingDirectory }))
}

function validationRoots(
  manifests: readonly string[],
): ReadonlyMap<RepositoryEcosystem, readonly string[]> {
  const roots = new Map<RepositoryEcosystem, Set<string>>()
  for (const manifest of manifests) {
    const ecosystem = ecosystemForManifest(path.posix.basename(manifest))
    if (ecosystem === undefined || ecosystem === 'node') continue
    const workingDirectory =
      path.posix.dirname(manifest) === '.' ? '.' : path.posix.dirname(manifest)
    const values = roots.get(ecosystem) ?? new Set<string>()
    values.add(workingDirectory)
    roots.set(ecosystem, values)
  }
  return new Map([...roots].map(([ecosystem, values]) => [ecosystem, [...values].sort()] as const))
}

function ecosystemForManifest(name: string): RepositoryEcosystem | undefined {
  if (['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'tox.ini'].includes(name)) {
    return 'python'
  }
  if (name === 'go.mod') return 'go'
  if (name === 'Cargo.toml') return 'rust'
  if (name === 'pom.xml' || name === 'mvnw') return 'java-maven'
  if (name === 'build.gradle' || name === 'build.gradle.kts' || name === 'gradlew') {
    return 'java-gradle'
  }
  if (/\.(?:sln|csproj|fsproj|vbproj)$/.test(name)) return 'dotnet'
  if (name === 'Gemfile') return 'ruby'
  if (name === 'composer.json') return 'php'
  if (name === 'package.json') return 'node'
  return undefined
}

async function findResearchMarkers(
  repositoryRoot: string,
  maxDepth: number,
  maxFiles: number,
): Promise<readonly string[]> {
  const root = path.resolve(repositoryRoot)
  const markers: string[] = []
  let visited = 0

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth || visited >= maxFiles) return
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (visited >= maxFiles) return
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolute, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      visited += 1
      if (RESEARCH_MARKERS[entry.name] === undefined) continue
      markers.push(path.relative(root, absolute).replaceAll('\\', '/'))
    }
  }

  await walk(root, 0)
  return markers.sort()
}

function dedupe(entries: readonly RepositoryValidationCommand[]): RepositoryValidationCommand[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.workingDirectory}\u0000${entry.command}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function distinctRoots(entries: readonly RepositoryValidationCommand[]): readonly string[] {
  return [...new Set(entries.map((entry) => entry.workingDirectory))].sort()
}
