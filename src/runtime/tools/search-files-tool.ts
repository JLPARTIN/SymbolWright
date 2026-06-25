import fs from 'node:fs'
import path from 'node:path'

import { assertReadablePath, resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface SearchFilesInput {
  readonly query: string
  readonly dir?: string
  readonly limit?: number
}

interface SearchMatch {
  readonly file: string
  readonly line: number
  readonly text: string
}

function isSkipped(relativePath: string, skippedDirs: readonly string[]): boolean {
  const segments = relativePath.split(path.sep).filter(Boolean)
  return segments.some((segment) => skippedDirs.includes(segment))
}

function searchDirectory(
  root: string,
  currentDir: string,
  query: string,
  skippedDirs: readonly string[],
  limit: number,
  matches: SearchMatch[],
): void {
  if (matches.length >= limit) {
    return
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (matches.length >= limit) {
      return
    }

    const fullPath = path.join(currentDir, entry.name)
    const relativePath = path.relative(root, fullPath)
    if (isSkipped(relativePath, skippedDirs)) {
      continue
    }

    if (entry.isDirectory()) {
      searchDirectory(root, fullPath, query, skippedDirs, limit, matches)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const content = fs.readFileSync(fullPath, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, index) => {
      if (matches.length < limit && line.toLowerCase().includes(query.toLowerCase())) {
        matches.push({ file: relativePath, line: index + 1, text: line.trim() })
      }
    })
  }
}

export async function executeSearchFilesTool(
  input: SearchFilesInput,
  context: RuntimeToolContext,
): Promise<string> {
  const query = input.query.trim()
  if (query.length === 0) {
    throw new Error('Missing query: codemind search <query>')
  }

  const requestedDir = input.dir?.trim() || '.'
  const limit = input.limit ?? 50
  const resolvedDir = resolveWorkspacePath(context.cwd, requestedDir)
  assertReadablePath(context.policy, context.cwd, resolvedDir)

  const matches: SearchMatch[] = []
  searchDirectory(context.cwd, resolvedDir, query, context.policy.noisyDirs, limit, matches)

  return [
    'CodeMind search',
    '',
    `Query: ${query}`,
    `Directory: ${requestedDir}`,
    `Limit: ${limit}`,
    '',
    'Matches:',
    ...(matches.length > 0
      ? matches.map((match) => `- ${match.file}:${match.line} ${match.text}`)
      : ['- No matches found.']),
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

export const searchFilesTool: RuntimeToolDefinition<SearchFilesInput> = {
  name: 'search_files',
  description: 'Search allowed workspace files without mutating them.',
  capability: 'SEARCH',
  execute: executeSearchFilesTool,
}
