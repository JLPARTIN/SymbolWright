import fs from 'node:fs'
import path from 'node:path'

import { resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface GlobToolInput {
  readonly pattern: string
  readonly cwd?: string
  readonly maxResults?: number
}

function parseGlobInput(input: unknown): GlobToolInput {
  if (typeof input !== 'object' || input === null || !('pattern' in input)) {
    throw new Error('Missing pattern: glob requires a file pattern')
  }
  const raw = input as Record<string, unknown>
  if (typeof raw['pattern'] !== 'string') {
    throw new Error('pattern must be a string')
  }
  return {
    pattern: raw['pattern'],
    ...(typeof raw['cwd'] === 'string' ? { cwd: raw['cwd'] } : {}),
    ...(typeof raw['maxResults'] === 'number' ? { maxResults: raw['maxResults'] } : {}),
  }
}

function matchGlobSimple(
  basePath: string,
  pattern: string,
  maxResults: number,
): string[] {
  const results: string[] = []
  const ext = path.extname(pattern)
  const isRecursive = pattern.includes('**')

  function walk(dir: string, depth: number): void {
    if (results.length >= maxResults) return
    if (depth > 10) return

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return
      const fullPath = path.join(dir, entry.name)

      if (entry.isFile()) {
        if (ext && fullPath.endsWith(ext)) {
          results.push(path.relative(basePath, fullPath))
        } else if (!ext) {
          results.push(path.relative(basePath, fullPath))
        }
      } else if (entry.isDirectory() && isRecursive) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue
        }
        walk(fullPath, depth + 1)
      }
    }
  }

  walk(basePath, 0)
  return results.sort()
}

export async function executeGlobTool(
  input: GlobToolInput,
  cwd: string,
): Promise<string> {
  const basePath = input.cwd
    ? resolveWorkspacePath(cwd, input.cwd)
    : cwd
  const maxResults = input.maxResults ?? 200

  const matches = matchGlobSimple(basePath, input.pattern, maxResults)

  return [
    'CodeMind glob',
    '',
    `Pattern: ${input.pattern}`,
    `Matches: ${matches.length}${matches.length >= maxResults ? ' (truncated)' : ''}`,
    '',
    ...matches,
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

export const globTool: RuntimeToolDefinition = {
  name: 'search_files' as RuntimeToolDefinition['name'],
  description: 'Find files matching a glob pattern in the workspace.',
  capability: 'SEARCH',
  execute: async (input, context) => executeGlobTool(parseGlobInput(input), context.cwd),
}
