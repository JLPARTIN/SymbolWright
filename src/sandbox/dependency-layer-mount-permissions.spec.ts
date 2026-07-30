import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { sealDependencyLayerForMount } from './dependency-layer-mount-permissions.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(path.join(root, 'node_modules', 'example'), 0o700)
    chmodSync(path.join(root, 'node_modules'), 0o700)
    rmSync(root, { recursive: true, force: true })
  }
})

describe('dependency layer mount permissions', () => {
  it('makes directories traversable and files read-only without losing executable bits', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'symbolwright-dependency-mount-'))
    roots.push(root)
    const nodeModules = path.join(root, 'node_modules')
    const packageRoot = path.join(nodeModules, 'example')
    mkdirSync(packageRoot, { recursive: true, mode: 0o700 })
    const library = path.join(packageRoot, 'index.js')
    const executable = path.join(packageRoot, 'cli.js')
    writeFileSync(library, 'module.exports = 1\n', { mode: 0o600 })
    writeFileSync(executable, '#!/usr/bin/env node\n', { mode: 0o700 })

    await sealDependencyLayerForMount(layer(root, nodeModules))

    expect(statSync(nodeModules).mode & 0o777).toBe(0o555)
    expect(statSync(packageRoot).mode & 0o777).toBe(0o555)
    expect(statSync(library).mode & 0o777).toBe(0o444)
    expect(statSync(executable).mode & 0o777).toBe(0o555)
  })
})

function layer(rootPath: string, nodeModulesPath: string): StrongSandboxDependencyLayer {
  return {
    schemaVersion: 1,
    layerId: 'permission-test',
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
    fileCount: 2,
    totalBytes: 32,
    manifestSha256: 'd'.repeat(64),
  }
}
