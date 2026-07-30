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
