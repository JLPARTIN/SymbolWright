import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { acquireExternalRepository } from './repository-acquisition.js'
import { buildRepositoryIntakeProfile } from './repository-intake-profile.js'
import { createGitHubOperationsPolicy } from './github-operations-policy.js'
import type { GitHubRepositoryTarget } from './github-repository-target.js'

/**
 * Bundle #8 external-repository integration trial. Does not depend on live
 * public GitHub: a real bare `git init --bare` repository stands in for the
 * remote, a real working checkout commits and pushes fixture files into it,
 * and the acquisition layer clones from that bare repository exactly as it
 * would clone from `https://github.com/owner/repo` (the destination string
 * is the only thing that differs — the git plumbing underneath is real).
 */

function target(canonicalHttpsUrl: string): GitHubRepositoryTarget {
  return {
    host: 'github.com',
    owner: 'fixture-owner',
    repo: 'fixture-repo',
    targetType: 'repository',
    sourceUrl: canonicalHttpsUrl,
    canonicalHttpsUrl,
  }
}

async function createBareOriginWithFixture(
  fixtureRoot: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const originPath = join(fixtureRoot, 'origin.git')
  const workingPath = join(fixtureRoot, 'working')
  mkdirSync(originPath, { recursive: true })
  mkdirSync(workingPath, { recursive: true })

  await runGitCommand(['init', '--bare'], originPath)
  await runGitCommand(['init'], workingPath)
  await runGitCommand(['config', 'user.email', 'fixture@example.com'], workingPath)
  await runGitCommand(['config', 'user.name', 'Fixture'], workingPath)
  await runGitCommand(['remote', 'add', 'origin', originPath], workingPath)

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(workingPath, relativePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
  await runGitCommand(['add', '.'], workingPath)
  await runGitCommand(['commit', '-m', 'fixture commit'], workingPath)
  await runGitCommand(['branch', '-m', 'main'], workingPath)
  await runGitCommand(['push', 'origin', 'main'], workingPath)
  // `git init --bare` defaults HEAD to a branch name (often "master") that
  // was never pushed. Real GitHub repositories always have HEAD pointing at
  // an actual branch, so point this fixture's bare "remote" at the branch
  // that was really pushed, matching real-world behavior.
  await runGitCommand(['symbolic-ref', 'HEAD', 'refs/heads/main'], originPath)

  return originPath
}

describe('external repository acquisition — Bundle #8 fixture trial', () => {
  let fixtureRoot: string
  let workspaceRoot: string

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'symbolwright-bundle8-fixture-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'symbolwright-bundle8-workspace-'))
  })

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
    rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('acquires a simple Node repository from a bare origin and detects the node ecosystem', async () => {
    const originPath = await createBareOriginWithFixture(fixtureRoot, {
      'package.json': JSON.stringify({
        name: 'fixture-node',
        scripts: { test: 'vitest run', lint: 'eslint .', build: 'tsc' },
      }),
      'src/index.ts': 'export const x = 1;\n',
    })

    const acquisition = await acquireExternalRepository({
      target: target(`file://${originPath}`),
      workspaceRoot,
      mode: 'writable',
    })
    expect(acquisition.acquired).toBe(true)

    const profile = await buildRepositoryIntakeProfile({
      target: target(`file://${originPath}`),
      acquisition,
      policy: createGitHubOperationsPolicy(),
    })
    expect(profile.portability?.ecosystems).toEqual(['node'])
    expect(profile.portability?.validationCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining('test'),
        expect.stringContaining('lint'),
        expect.stringContaining('build'),
      ]),
    )
    expect(profile.riskFlags).not.toContain('no-validation-commands-discovered')
  })

  it('acquires a Python repository and detects the python ecosystem', async () => {
    const originPath = await createBareOriginWithFixture(fixtureRoot, {
      'pyproject.toml': '[project]\nname = "fixture-python"\n',
      'src/main.py': 'print("hello")\n',
    })

    const acquisition = await acquireExternalRepository({
      target: target(`file://${originPath}`),
      workspaceRoot,
      mode: 'writable',
    })
    const profile = await buildRepositoryIntakeProfile({
      target: target(`file://${originPath}`),
      acquisition,
      policy: createGitHubOperationsPolicy(),
    })
    expect(profile.portability?.ecosystems).toEqual(['python'])
    expect(profile.portability?.validationCommands.length).toBeGreaterThan(0)
  })

  it('acquires a mixed Node/Python monorepo and detects both ecosystems with package roots', async () => {
    const originPath = await createBareOriginWithFixture(fixtureRoot, {
      'services/api/package.json': JSON.stringify({
        name: 'api',
        scripts: { test: 'vitest run' },
      }),
      'services/api/src/index.ts': 'export {};\n',
      'services/worker/pyproject.toml': '[project]\nname = "worker"\n',
      'services/worker/main.py': 'print("worker")\n',
    })

    const acquisition = await acquireExternalRepository({
      target: target(`file://${originPath}`),
      workspaceRoot,
      mode: 'writable',
    })
    const profile = await buildRepositoryIntakeProfile({
      target: target(`file://${originPath}`),
      acquisition,
      policy: createGitHubOperationsPolicy(),
    })
    expect(profile.portability?.mixed).toBe(true)
    expect(profile.portability?.ecosystems).toEqual(expect.arrayContaining(['node', 'python']))
    expect(profile.riskFlags).toContain('mixed-ecosystem-repository')
    expect(profile.packageRoots.length).toBeGreaterThan(0)
  })

  it('marks an unsupported-toolchain repository (Zig) as research-only, never as an executable command', async () => {
    const originPath = await createBareOriginWithFixture(fixtureRoot, {
      'build.zig': 'const std = @import("std");\n',
      'src/main.zig': 'pub fn main() void {}\n',
    })

    const acquisition = await acquireExternalRepository({
      target: target(`file://${originPath}`),
      workspaceRoot,
      mode: 'writable',
    })
    const profile = await buildRepositoryIntakeProfile({
      target: target(`file://${originPath}`),
      acquisition,
      policy: createGitHubOperationsPolicy(),
    })
    expect(profile.portability?.validationCommands).toEqual([])
    expect(profile.portability?.researchQueries.length).toBeGreaterThan(0)
    expect(profile.portability?.researchQueries.join(' ')).toContain('Zig')
    expect(profile.riskFlags).toContain('unsupported-toolchain-requires-research')
    expect(profile.riskFlags).toContain('no-validation-commands-discovered')
  })

  it('never mutates the bare origin merely by acquiring and inspecting the clone', async () => {
    const originPath = await createBareOriginWithFixture(fixtureRoot, {
      'package.json': JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }),
    })
    const beforeRefs = await runGitCommand(['show-ref'], originPath)

    await acquireExternalRepository({
      target: target(`file://${originPath}`),
      workspaceRoot,
      mode: 'writable',
    })

    const afterRefs = await runGitCommand(['show-ref'], originPath)
    expect(afterRefs.stdout).toBe(beforeRefs.stdout)
  })

  it('mutating the acquired clone never touches the bare origin unless explicitly pushed', async () => {
    const originPath = await createBareOriginWithFixture(fixtureRoot, {
      'package.json': JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }),
    })
    const acquisition = await acquireExternalRepository({
      target: target(`file://${originPath}`),
      workspaceRoot,
      mode: 'writable',
    })
    expect(acquisition.acquired).toBe(true)

    writeFileSync(join(acquisition.workspacePath, 'mutation.txt'), 'local mutation only')
    await runGitCommand(['add', 'mutation.txt'], acquisition.workspacePath)
    await runGitCommand(['commit', '-m', 'local mutation'], acquisition.workspacePath)

    const originLog = await runGitCommand(['log', '--all', '--oneline'], originPath)
    expect(originLog.stdout).not.toContain('local mutation')
  })
})
