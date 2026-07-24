import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'
import {
  collectRepositoryIndexSourceFiles,
  ensureRepositorySemanticIndex,
} from './repository-semantic-index-bootstrap.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('repository semantic index bootstrap', () => {
  it('collects real repository source deterministically and ignores generated dependency trees', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-package' }))
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(
      path.join(root, 'src', 'feature.ts'),
      "export function runFeature() { return 'ready' }\n",
    )
    await writeFile(
      path.join(root, 'src', 'consumer.ts'),
      "import { runFeature } from './feature.js'\nexport const result = runFeature()\n",
    )
    await mkdir(path.join(root, 'node_modules', 'ignored'), { recursive: true })
    await writeFile(
      path.join(root, 'node_modules', 'ignored', 'index.ts'),
      'export const ignored = 1\n',
    )
    await mkdir(path.join(root, 'dist'), { recursive: true })
    await writeFile(path.join(root, 'dist', 'generated.js'), 'export const generated = true\n')

    const files = await collectRepositoryIndexSourceFiles(root)

    expect(
      files.map((file) => path.relative(root, file.absolutePath).replaceAll('\\', '/')),
    ).toEqual(['package.json', 'src/consumer.ts', 'src/feature.ts'])
    expect(files.every((file) => file.packageOwner === 'fixture-package')).toBe(true)
  })

  it('builds and persists a missing semantic index for a live repository', async () => {
    const root = await fixtureRoot()
    const workspaceRoot = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'feature.ts'), 'export class FeatureService {}\n')
    const store = new RepositorySemanticIndexStore(path.join(workspaceRoot, '.codemind'))

    const index = await ensureRepositorySemanticIndex({
      workspaceRoot,
      repositoryRoot: root,
      store,
      now: () => new Date('2026-07-23T23:00:00.000Z'),
    })

    expect(index.files.map((file) => file.path)).toEqual(['src/feature.ts'])
    expect(index.symbols.map((symbol) => symbol.name)).toEqual(['FeatureService'])
    expect(await store.load(root)).toEqual(index)
  })

  it('preserves an existing persisted index unless a forced rebuild is requested', async () => {
    const root = await fixtureRoot()
    const workspaceRoot = await fixtureRoot()
    await writeFile(path.join(root, 'old.ts'), 'export const oldValue = 1\n')
    const store = new RepositorySemanticIndexStore(path.join(workspaceRoot, '.codemind'))
    const first = await ensureRepositorySemanticIndex({
      workspaceRoot,
      repositoryRoot: root,
      store,
    })
    await writeFile(path.join(root, 'new.ts'), 'export const newValue = 2\n')

    const preserved = await ensureRepositorySemanticIndex({
      workspaceRoot,
      repositoryRoot: root,
      store,
    })
    const rebuilt = await ensureRepositorySemanticIndex({
      workspaceRoot,
      repositoryRoot: root,
      store,
      force: true,
    })

    expect(preserved).toEqual(first)
    expect(rebuilt.files.map((file) => file.path)).toEqual(['new.ts', 'old.ts'])
  })
})

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-semantic-bootstrap-'))
  roots.push(root)
  return root
}
