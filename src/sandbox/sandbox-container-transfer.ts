import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { MaterializedSandboxWorkspace } from './sandbox-container-workspace.js'

export const SANDBOX_CONTAINER_COPY_IN_SCRIPT = `
const fs = require('node:fs')
const path = require('node:path')
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  const payload = JSON.parse(input)
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.files)) {
    throw new Error('Invalid SymbolWright workspace payload.')
  }
  for (const file of payload.files) {
    if (!file || typeof file.path !== 'string' || typeof file.base64 !== 'string') {
      throw new Error('Invalid SymbolWright workspace file.')
    }
    const normalized = path.posix.normalize(file.path.replaceAll('\\\\', '/'))
    if (
      normalized.length === 0 ||
      path.posix.isAbsolute(normalized) ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      normalized.includes('\\0')
    ) {
      throw new Error('Unsafe SymbolWright workspace file path.')
    }
    const destination = path.posix.join('/workspace', normalized)
    fs.mkdirSync(path.posix.dirname(destination), { recursive: true, mode: 0o700 })
    fs.writeFileSync(destination, Buffer.from(file.base64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    })
  }
})
`

export async function serializeSandboxContainerInput(
  workspace: MaterializedSandboxWorkspace,
): Promise<string> {
  const files: Array<{ readonly path: string; readonly base64: string }> = []
  for (const relativePath of [...workspace.inputManifest.keys()].sort()) {
    const absolutePath = path.resolve(workspace.inputDir, relativePath)
    const relative = path.relative(workspace.inputDir, absolutePath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Materialized sandbox path escaped the input root: ${relativePath}.`)
    }
    const content = await readFile(absolutePath)
    files.push({ path: relativePath, base64: content.toString('base64') })
  }
  return JSON.stringify({ schemaVersion: 1, files })
}
