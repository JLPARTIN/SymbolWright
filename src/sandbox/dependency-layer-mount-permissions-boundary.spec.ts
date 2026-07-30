import { promises as fs } from 'node:fs'
import { createServer, type Server } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { sealDependencyLayerForMount } from './dependency-layer-mount-permissions.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

const roots: string[] = []
const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('dependency layer mount permission boundaries', () => {
  it('rejects a node_modules path outside the verified layer root', async () => {
    const parent = await temporaryRoot()
    const layerRoot = path.join(parent, 'layer')
    const outsideNodeModules = path.join(parent, 'outside-node_modules')
    await fs.mkdir(layerRoot)
    await fs.mkdir(outsideNodeModules)

    await expect(sealDependencyLayerForMount(layer(layerRoot, outsideNodeModules))).rejects.toThrow(
      'Dependency node_modules path escapes its verified layer root.',
    )
  })

  it('rejects symbolic links inside the dependency tree', async () => {
    const root = await temporaryRoot()
    const nodeModules = path.join(root, 'node_modules')
    await fs.mkdir(nodeModules)
    await fs.writeFile(path.join(root, 'target.js'), 'module.exports = 1\n', 'utf8')
    await fs.symlink('../target.js', path.join(nodeModules, 'linked.js'))

    await expect(sealDependencyLayerForMount(layer(root, nodeModules))).rejects.toThrow(
      'Dependency layer mount preparation rejects symbolic links.',
    )
  })

  it('rejects special filesystem entries inside the dependency tree', async () => {
    const root = await temporaryRoot()
    const nodeModules = path.join(root, 'node_modules')
    const socketPath = path.join(nodeModules, 'package.sock')
    await fs.mkdir(nodeModules)
    const server = createServer()
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, resolve)
    })

    await expect(sealDependencyLayerForMount(layer(root, nodeModules))).rejects.toThrow(
      'Dependency layer mount preparation rejects special files.',
    )
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-mount-boundary-'))
  roots.push(root)
  return root
}

function layer(rootPath: string, nodeModulesPath: string): StrongSandboxDependencyLayer {
  return {
    schemaVersion: 1,
    layerId: 'boundary-test',
    ecosystem: 'npm',
    rootPath,
    nodeModulesPath,
    manifestPath: path.join(rootPath, 'manifest.json'),
    sbomPath: path.join(rootPath, 'sbom.json'),
    policyId: 'npm-controlled',
    policyVersion: 1,
    policyFingerprint: 'a'.repeat(64),
    packageJsonSha256: 'b'.repeat(64),
    packageLockSha256: 'c'.repeat(64),
    packageCount: 1,
    fileCount: 1,
    totalBytes: 1,
    manifestSha256: 'd'.repeat(64),
  }
}
