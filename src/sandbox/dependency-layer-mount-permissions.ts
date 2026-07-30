import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

/**
 * Converts a verified dependency tree from private materialization permissions into a non-writable,
 * non-root-readable mount. Content and executable bits are preserved; links and special files fail
 * closed. The strong container still receives the tree through a read-only bind mount.
 */
export async function sealDependencyLayerForMount(
  layer: StrongSandboxDependencyLayer,
): Promise<void> {
  const root = await fs.realpath(layer.rootPath)
  const nodeModules = await fs.realpath(layer.nodeModulesPath)
  const relative = path.relative(root, nodeModules)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Dependency node_modules path escapes its verified layer root.')
  }
  await sealDirectory(nodeModules)
}

async function sealDirectory(directory: string): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    const stat = await fs.lstat(absolute)
    if (stat.isSymbolicLink()) {
      throw new Error('Dependency layer mount preparation rejects symbolic links.')
    }
    if (stat.isDirectory()) {
      await sealDirectory(absolute)
      await fs.chmod(absolute, 0o555)
      continue
    }
    if (!stat.isFile()) {
      throw new Error('Dependency layer mount preparation rejects special files.')
    }
    await fs.chmod(absolute, (stat.mode & 0o111) === 0 ? 0o444 : 0o555)
  }
  await fs.chmod(directory, 0o555)
}
