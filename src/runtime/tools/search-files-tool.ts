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

function parseSearchFilesInput(input: unknown): SearchFilesInput {
  if (typeof input !== 'object' || input === null || !('query' in input)) {
    throw new Error('Missing query: symbolwright search <query>')
  }

  const value = input as Record<string, unknown>
  if (typeof value['query'] !== 'string') {
    throw new Error('Missing query: symbolwright search <query>')
  }

  const parsed: { query: string; dir?: string; limit?: number } = { query: value['query'] }
  if (typeof value['dir'] === 'string') {
    parsed.dir = value['dir']
  }
  if (typeof value['limit'] === 'number') {
    parsed.limit = value['limit']
  }

  return parsed
}

export async function executeSearchFilesTool(
  input: SearchFilesInput,
  context: RuntimeToolContext,
): Promise<string> {
  const query = input.query.trim()
  if (query.length === 0) {
    throw new Error('Missing query: symbolwright search <query>')
  }

  const requestedDir = input.dir?.trim() || '.'
  const limit = input.limit ?? 50
  const resolvedDir = resolveWorkspacePath(context.cwd, requestedDir)
  assertReadablePath(context.policy, context.cwd, resolvedDir)

  const matches: SearchMatch[] = []
  searchDirectory(context.cwd, resolvedDir, query, context.policy.noisyDirs, limit, matches)

  return [
    'SymbolWright search',
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

export const searchFilesTool: RuntimeToolDefinition = {
  name: 'search_files',
  description: 'Search allowed workspace files.',
  capability: 'SEARCH',
  execute: async (input, context) => executeSearchFilesTool(parseSearchFilesInput(input), context),
}
