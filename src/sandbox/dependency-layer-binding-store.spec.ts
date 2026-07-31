import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  seal: vi.fn(),
  ensureSecureStateDirectory: vi.fn(),
}))

vi.mock('./npm-dependency-layer.js', () => ({
  verifyNpmDependencyLayer: mocks.verify,
}))
vi.mock('./dependency-layer-mount-permissions.js', () => ({
  sealDependencyLayerForMount: mocks.seal,
}))
vi.mock('./secure-state-directory.js', () => ({
  ensureSecureStateDirectory: mocks.ensureSecureStateDirectory,
}))

import { DependencyLayerBindingStore } from './dependency-layer-binding-store.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

const roots: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verify.mockResolvedValue({})
  mocks.seal.mockResolvedValue(undefined)
  mocks.ensureSecureStateDirectory.mockImplementation(async (root: string) => {
    await fs.mkdir(root, { recursive: true, mode: 0o700 })
  })
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('DependencyLayerBindingStore', () => {
  it('atomically binds and resolves a verified, sealed layer by normalized workspace identity', async () => {
    const root = await temporaryRoot()
    const store = new DependencyLayerBindingStore(root)
    const layer = dependencyLayer()

    const bindingPath = await store.bind(' workspace-1 ', layer)

    expect(path.basename(bindingPath)).toBe(`${sha256('workspace-1')}.json`)
    expect((await fs.stat(bindingPath)).mode & 0o777).toBe(0o600)
    expect(mocks.verify).toHaveBeenCalledTimes(2)
    expect(mocks.seal).toHaveBeenCalledTimes(1)
    expect(mocks.ensureSecureStateDirectory).toHaveBeenCalledWith(root)

    const stored = JSON.parse(await fs.readFile(bindingPath, 'utf8')) as {
      readonly workspaceIdSha256: string
      readonly boundAt: string
    }
    expect(stored.workspaceIdSha256).toBe(sha256('workspace-1'))
    expect(Number.isNaN(Date.parse(stored.boundAt))).toBe(false)

    await expect(store.resolve('workspace-1')).resolves.toEqual(layer)
    expect(mocks.verify).toHaveBeenCalledTimes(3)
    expect(mocks.seal).toHaveBeenCalledTimes(2)
  })

  it('never corrupts state under N concurrent binds to the same workspace identity -- exactly one binding survives, fully readable', async () => {
    const root = await temporaryRoot()
    const store = new DependencyLayerBindingStore(root)
    const layers = Array.from({ length: 8 }, (_, index) => ({
      ...dependencyLayer(),
      layerId: `layer-${index}`,
    }))

    await Promise.all(layers.map((layer) => store.bind('workspace-1', layer)))

    const resolved = await store.resolve('workspace-1')
    expect(layers.map((layer) => layer.layerId)).toContain(resolved?.layerId)
    const entries = await fs.readdir(root)
    expect(entries.filter((entry) => entry.endsWith('.json'))).toEqual([
      `${sha256('workspace-1')}.json`,
    ])
  })

  it('returns undefined when no binding exists', async () => {
    const store = new DependencyLayerBindingStore(await temporaryRoot())

    await expect(store.resolve('missing-workspace')).resolves.toBeUndefined()
  })

  it('rejects empty workspace identities for both binding and resolution', async () => {
    const store = new DependencyLayerBindingStore(await temporaryRoot())

    await expect(store.bind('   ', dependencyLayer())).rejects.toThrow(
      'workspaceId must not be empty.',
    )
    await expect(store.resolve('\n')).rejects.toThrow('workspaceId must not be empty.')
  })

  it('rethrows filesystem failures that are not missing-binding errors', async () => {
    const parent = await temporaryRoot()
    const rootFile = path.join(parent, 'not-a-directory')
    await fs.writeFile(rootFile, 'file', 'utf8')
    const store = new DependencyLayerBindingStore(rootFile)

    await expect(store.resolve('workspace-1')).rejects.toMatchObject({ code: 'ENOTDIR' })
  })

  it.each([
    ['not valid JSON', 'not-json', 'Dependency layer binding is not valid JSON.'],
    ['a primitive', '1', 'Dependency layer binding must be an object.'],
    ['null', 'null', 'Dependency layer binding must be an object.'],
    ['an array', '[]', 'Dependency layer binding must be an object.'],
    [
      'an unsupported schema',
      JSON.stringify({ schemaVersion: 2 }),
      'Dependency layer binding schema version is unsupported.',
    ],
    [
      'a missing workspace hash',
      JSON.stringify({ schemaVersion: 1, boundAt: new Date().toISOString(), layer: {} }),
      'Dependency layer binding metadata is invalid.',
    ],
    [
      'a missing bound time',
      JSON.stringify({ schemaVersion: 1, workspaceIdSha256: sha256('workspace-1'), layer: {} }),
      'Dependency layer binding metadata is invalid.',
    ],
    [
      'a primitive layer',
      JSON.stringify(validRecord('workspace-1', 1)),
      'Dependency layer binding has no valid layer reference.',
    ],
    [
      'a null layer',
      JSON.stringify(validRecord('workspace-1', null)),
      'Dependency layer binding has no valid layer reference.',
    ],
    [
      'an array layer',
      JSON.stringify(validRecord('workspace-1', [])),
      'Dependency layer binding has no valid layer reference.',
    ],
  ])('rejects %s', async (_label, text, expectedMessage) => {
    const root = await temporaryRoot()
    await writeBinding(root, 'workspace-1', text)
    const store = new DependencyLayerBindingStore(root)

    await expect(store.resolve('workspace-1')).rejects.toThrow(expectedMessage)
  })

  it('rejects a binding copied under a different authorized workspace identity', async () => {
    const root = await temporaryRoot()
    await writeBinding(
      root,
      'workspace-1',
      JSON.stringify(validRecord('other-workspace', dependencyLayer())),
    )
    const store = new DependencyLayerBindingStore(root)

    await expect(store.resolve('workspace-1')).rejects.toThrow(
      'Dependency layer binding does not match the authorized workspace identity.',
    )
  })

  describe('listBindings', () => {
    it('returns an empty list when the store directory does not exist yet', async () => {
      const store = new DependencyLayerBindingStore(
        path.join(await temporaryRoot(), 'never-created'),
      )
      await expect(store.listBindings()).resolves.toEqual([])
    })

    it('classifies a verifiable binding as valid without sealing it for mount', async () => {
      const root = await temporaryRoot()
      await writeBinding(
        root,
        'workspace-1',
        JSON.stringify(validRecord('workspace-1', dependencyLayer())),
      )
      const store = new DependencyLayerBindingStore(root)

      const summaries = await store.listBindings()

      expect(summaries).toEqual([
        { layerId: 'layer-1', boundAt: expect.any(String), status: 'valid' },
      ])
      expect(mocks.seal).not.toHaveBeenCalled()
    })

    it('classifies a binding whose layer no longer verifies as missing-layer, without throwing', async () => {
      const root = await temporaryRoot()
      await writeBinding(
        root,
        'workspace-1',
        JSON.stringify(validRecord('workspace-1', dependencyLayer())),
      )
      const store = new DependencyLayerBindingStore(root)
      mocks.verify.mockRejectedValueOnce(new Error('layer directory is gone'))

      const summaries = await store.listBindings()

      expect(summaries).toEqual([
        {
          layerId: 'layer-1',
          boundAt: expect.any(String),
          status: 'missing-layer',
          detail: 'layer directory is gone',
        },
      ])
    })

    it('classifies a corrupt binding record as invalid-record instead of failing the whole scan', async () => {
      const root = await temporaryRoot()
      await writeBinding(root, 'workspace-1', 'not-json')
      await writeBinding(
        root,
        'workspace-2',
        JSON.stringify(validRecord('workspace-2', dependencyLayer())),
      )
      const store = new DependencyLayerBindingStore(root)

      const summaries = await store.listBindings()

      expect(summaries).toHaveLength(2)
      expect(summaries).toContainEqual(
        expect.objectContaining({
          status: 'invalid-record',
          detail: 'Dependency layer binding is not valid JSON.',
        }),
      )
      expect(summaries).toContainEqual(
        expect.objectContaining({ status: 'valid', layerId: 'layer-1' }),
      )
    })

    it('never follows a symlink planted where a binding file should be', async () => {
      const root = await temporaryRoot()
      await writeBinding(
        root,
        'workspace-1',
        JSON.stringify(validRecord('workspace-1', dependencyLayer())),
      )
      const realFile = path.join(root, `${sha256('workspace-1')}.json`)
      const linkTarget = path.join(root, 'elsewhere.data')
      await fs.writeFile(
        linkTarget,
        JSON.stringify(validRecord('other', dependencyLayer())),
        'utf8',
      )
      await fs.unlink(realFile)
      await fs.symlink(linkTarget, realFile)
      const store = new DependencyLayerBindingStore(root)

      await expect(store.listBindings()).resolves.toEqual([])
    })

    it('ignores non-.json entries such as leftover .tmp- write artifacts', async () => {
      const root = await temporaryRoot()
      await fs.mkdir(root, { recursive: true })
      await fs.writeFile(
        path.join(root, `${sha256('workspace-1')}.json.tmp-1234-abc`),
        'garbage',
        'utf8',
      )
      const store = new DependencyLayerBindingStore(root)

      await expect(store.listBindings()).resolves.toEqual([])
    })
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-binding-store-'))
  roots.push(root)
  return root
}

async function writeBinding(root: string, workspaceId: string, text: string): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path.join(root, `${sha256(workspaceId)}.json`), text, 'utf8')
}

function validRecord(workspaceId: string, layer: unknown): Record<string, unknown> {
  return {
    schemaVersion: 1,
    workspaceIdSha256: sha256(workspaceId),
    boundAt: '2026-07-30T00:00:00.000Z',
    layer,
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function dependencyLayer(): StrongSandboxDependencyLayer {
  return {
    schemaVersion: 1,
    layerId: 'layer-1',
    ecosystem: 'npm',
    rootPath: '/state/layer-1',
    nodeModulesPath: '/state/layer-1/node_modules',
    manifestPath: '/state/layer-1/manifest.json',
    sbomPath: '/state/layer-1/sbom.json',
    policyId: 'npm-controlled',
    policyVersion: 1,
    policyFingerprint: 'a'.repeat(64),
    packageJsonSha256: 'b'.repeat(64),
    packageLockSha256: 'c'.repeat(64),
    packageCount: 1,
    fileCount: 2,
    totalBytes: 32,
    manifestSha256: 'd'.repeat(64),
  }
}
