import fs from 'node:fs'
import path from 'node:path'

import { resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface EditFileInput {
  readonly path: string
  readonly oldText: string
  readonly newText: string
  readonly replaceAll?: boolean
}

function parseEditFileInput(input: unknown): EditFileInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid edit input: requires path, oldText, newText')
  }
  const raw = input as Record<string, unknown>

  if (typeof raw['path'] !== 'string' || raw['path'].length === 0) {
    throw new Error('Missing or empty path')
  }
  if (typeof raw['oldText'] !== 'string') {
    throw new Error('Missing oldText')
  }
  if (typeof raw['newText'] !== 'string') {
    throw new Error('Missing newText')
  }
  if (raw['oldText'] === raw['newText']) {
    throw new Error('oldText and newText are identical')
  }

  return {
    path: raw['path'],
    oldText: raw['oldText'],
    newText: raw['newText'],
    ...(typeof raw['replaceAll'] === 'boolean' ? { replaceAll: raw['replaceAll'] } : {}),
  }
}

export async function executeEditFileTool(
  input: EditFileInput,
  cwd: string,
  assertWrite: (cwd: string, filePath: string) => void,
): Promise<string> {
  const resolvedPath = resolveWorkspacePath(cwd, input.path)
  assertWrite(cwd, resolvedPath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${input.path}`)
  }

  const stat = fs.statSync(resolvedPath)
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${input.path}`)
  }

  const originalContent = fs.readFileSync(resolvedPath, 'utf-8')

  if (!originalContent.includes(input.oldText)) {
    throw new Error(
      `oldText not found in ${input.path}. The text to replace must exactly match existing content.`,
    )
  }

  if (!input.replaceAll) {
    const firstIdx = originalContent.indexOf(input.oldText)
    const secondIdx = originalContent.indexOf(input.oldText, firstIdx + 1)
    if (secondIdx !== -1) {
      throw new Error(
        `oldText appears multiple times in ${input.path}. Provide more context to make it unique, or use replaceAll.`,
      )
    }
  }

  const newContent = input.replaceAll
    ? originalContent.split(input.oldText).join(input.newText)
    : originalContent.replace(input.oldText, input.newText)

  fs.writeFileSync(resolvedPath, newContent, 'utf-8')

  const relativePath = path.relative(cwd, resolvedPath) || path.basename(resolvedPath)
  const replacements = input.replaceAll
    ? originalContent.split(input.oldText).length - 1
    : 1

  return [
    'CodeMind edit',
    '',
    `Path: ${relativePath}`,
    `Replacements: ${replacements}`,
    '',
    '--- old',
    input.oldText,
    '+++ new',
    input.newText,
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

export const editFileTool: RuntimeToolDefinition = {
  name: 'propose_edit' as RuntimeToolDefinition['name'],
  description: 'Make a surgical search-and-replace edit to a file. Fails if oldText is not found.',
  capability: 'PROPOSE',
  execute: async (input, context) => {
    if (!context.policy.allowWrites) {
      throw new Error('Write operations are not allowed by current policy.')
    }
    return executeEditFileTool(
      parseEditFileInput(input),
      context.cwd,
      () => {
        if (!context.policy.allowWrites) {
          throw new Error('Write operations are not allowed by current policy.')
        }
      },
    )
  },
}
