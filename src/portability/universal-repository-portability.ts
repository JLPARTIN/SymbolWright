import path from 'node:path'

import {
  discoverRepositoryPortability,
  type RepositoryEcosystem,
  type RepositoryPortabilityDiscoveryOptions,
  type RepositoryPortabilityProfile,
  type RepositoryValidationCommand,
} from './repository-portability.js'

export async function discoverUniversalRepositoryPortability(
  repositoryRoot: string,
  options: RepositoryPortabilityDiscoveryOptions = {},
): Promise<RepositoryPortabilityProfile> {
  return expandMonorepoValidation(
    await discoverRepositoryPortability(repositoryRoot, options),
  )
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
    const workingDirectory = path.posix.dirname(manifest) === '.' ? '.' : path.posix.dirname(manifest)
    const values = roots.get(ecosystem) ?? new Set<string>()
    values.add(workingDirectory)
    roots.set(ecosystem, values)
  }
  return new Map(
    [...roots].map(([ecosystem, values]) => [ecosystem, [...values].sort()] as const),
  )
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

function dedupe(
  entries: readonly RepositoryValidationCommand[],
): RepositoryValidationCommand[] {
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
