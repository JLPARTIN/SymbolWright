import fs from 'node:fs'
import path from 'node:path'

import { assertReadablePath, resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface ListFilesInput {
  readonly dir?: string
  readonly limit?: number
}

function shouldSkip(relativePath: string, skippedDirs: readonly string[]): boolean {
  const segments = relativePath.split(path.sep).filter(Boolean)
  return segments.some((segment) => skippedDirs.includes(segment))
}

function collectWorkspaceFiles(
  root: string,
  currentDir: string,
  skippedDirs: readonly string[],
  limit: number,
  collected: string[],
): void {
  if (collected.length >= limit) {
    return
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (collected.length >= limit) {
      return
    }

    const fullPath = path.join(currentDir, entry.name)
    const relativePath = path.relative(root, fullPath)
    if (shouldSkip(relativePath, skippedDirs)) {
      continue
    }

    if (entry.isDirectory()) {
      collectWorkspaceFiles(root, fullPath, skippedDirs, limit, collected)
    } else if (entry.isFile()) {
      collected.push(relativePath)
    }
  }
}

export async function executeListFilesTool(
  input: ListFilesInput,
  context: RuntimeToolContext,
): Promise<string> {
  const requestedDir = input.dir?.trim() || '.'
  const limit = input.limit ?? 100
  const resolvedDir = resolveWorkspacePath(context.cwd, requestedDir)
  assertReadablePath(context.policy, context.cwd, resolvedDir)

  const stat = fs.statSync(resolvedDir)
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${requestedDir}`)
  }

  const collected: string[] = []
  collectWorkspaceFiles(context.cwd, resolvedDir, context.policy.noisyDirs, limit, collected)

  return [
    'CodeMind list-files',
    '',
    `Directory: ${requestedDir}`,
    `Limit: ${limit}`,
    '',
    'Files:',
    ...(collected.length > 0 ? collected.map((file) => `- ${file}`) : ['- No files found.']),
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

export const listFilesTool: RuntimeToolDefinition<ListFilesInput> = {
  name: 'list_files',
  description: 'List allowed workspace files without mutating them.',
  capability: 'READ',
  execute: executeListFilesTool,
}
