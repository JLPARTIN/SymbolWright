import fs from 'node:fs'
import path from 'node:path'

import { resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface GrepToolInput {
  readonly pattern: string
  readonly path?: string
  readonly filePattern?: string
  readonly contextLines?: number
  readonly maxResults?: number
}

function parseGrepInput(input: unknown): GrepToolInput {
  if (typeof input !== 'object' || input === null || !('pattern' in input)) {
    throw new Error('Missing pattern: grep requires a search pattern')
  }
  const raw = input as Record<string, unknown>
  if (typeof raw['pattern'] !== 'string') {
    throw new Error('pattern must be a string')
  }
  return {
    pattern: raw['pattern'],
    ...(typeof raw['path'] === 'string' ? { path: raw['path'] } : {}),
    ...(typeof raw['filePattern'] === 'string' ? { filePattern: raw['filePattern'] } : {}),
    ...(typeof raw['contextLines'] === 'number' ? { contextLines: raw['contextLines'] } : {}),
    ...(typeof raw['maxResults'] === 'number' ? { maxResults: raw['maxResults'] } : {}),
  }
}

interface GrepMatch {
  readonly file: string
  readonly line: number
  readonly content: string
  readonly context: readonly string[]
}

function searchFile(
  filePath: string,
  regex: RegExp,
  contextLines: number,
  basePath: string,
): GrepMatch[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  const lines = content.split('\n')
  const matches: GrepMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i]!)) {
      const start = Math.max(0, i - contextLines)
      const end = Math.min(lines.length - 1, i + contextLines)
      const ctx: string[] = []
      for (let j = start; j <= end; j++) {
        const prefix = j === i ? '>' : ' '
        ctx.push(`${prefix} ${j + 1}: ${lines[j]}`)
      }
      matches.push({
        file: path.relative(basePath, filePath),
        line: i + 1,
        content: lines[i]!,
        context: ctx,
      })
    }
  }

  return matches
}

function walkAndSearch(
  dir: string,
  regex: RegExp,
  contextLines: number,
  basePath: string,
  filePattern: string | undefined,
  maxResults: number,
  depth: number,
): GrepMatch[] {
  if (depth > 10) return []

  const results: GrepMatch[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break

    const fullPath = path.join(dir, entry.name)

    if (entry.isFile()) {
      if (filePattern) {
        const ext = path.extname(entry.name)
        if (!filePattern.includes(ext) && !entry.name.includes(filePattern.replace('*', ''))) {
          continue
        }
      }

      const matches = searchFile(fullPath, regex, contextLines, basePath)
      for (const match of matches) {
        if (results.length >= maxResults) break
        results.push(match)
      }
    } else if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
        continue
      }
      const subResults = walkAndSearch(
        fullPath,
        regex,
        contextLines,
        basePath,
        filePattern,
        maxResults - results.length,
        depth + 1,
      )
      results.push(...subResults)
    }
  }

  return results
}

export async function executeGrepTool(input: GrepToolInput, cwd: string): Promise<string> {
  const basePath = input.path ? resolveWorkspacePath(cwd, input.path) : cwd
  const contextLines = input.contextLines ?? 2
  const maxResults = input.maxResults ?? 50

  let regex: RegExp
  try {
    regex = new RegExp(input.pattern, 'g')
  } catch {
    return `Invalid regex pattern: ${input.pattern}`
  }

  const matches = walkAndSearch(
    basePath,
    regex,
    contextLines,
    basePath,
    input.filePattern,
    maxResults,
    0,
  )

  if (matches.length === 0) {
    return [
      'CodeMind grep',
      '',
      `Pattern: ${input.pattern}`,
      'No matches found.',
      '',
      renderRuntimeBoundary(),
    ].join('\n')
  }

  const lines: string[] = [
    'CodeMind grep',
    '',
    `Pattern: ${input.pattern}`,
    `Matches: ${matches.length}${matches.length >= maxResults ? ' (truncated)' : ''}`,
    '',
  ]

  for (const match of matches) {
    lines.push(`${match.file}:${match.line}`)
    for (const ctx of match.context) {
      lines.push(ctx)
    }
    lines.push('')
  }

  lines.push(renderRuntimeBoundary())
  return lines.join('\n')
}

export const grepTool: RuntimeToolDefinition = {
  name: 'grep',
  description: 'Search for a regex pattern across workspace files with context.',
  capability: 'SEARCH',
  execute: async (input, context) => executeGrepTool(parseGrepInput(input), context.cwd),
}
