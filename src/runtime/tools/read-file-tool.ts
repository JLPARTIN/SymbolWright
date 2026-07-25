import fs from 'node:fs'
import path from 'node:path'

import { assertReadablePath, resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface ReadFileInput {
  readonly path: string
}

function parseReadFileInput(input: unknown): ReadFileInput {
  if (typeof input !== 'object' || input === null || !('path' in input)) {
    throw new Error('Missing path: codemind read <path>')
  }

  const pathValue = (input as { readonly path: unknown }).path
  if (typeof pathValue !== 'string') {
    throw new Error('Missing path: codemind read <path>')
  }

  return { path: pathValue }
}

export async function executeReadFileTool(
  input: ReadFileInput,
  context: RuntimeToolContext,
): Promise<string> {
  const requestedPath = input.path.trim()
  if (requestedPath.length === 0) {
    throw new Error('Missing path: codemind read <path>')
  }

  const resolvedPath = resolveWorkspacePath(context.cwd, requestedPath)
  assertReadablePath(context.policy, context.cwd, resolvedPath)

  const stat = fs.statSync(resolvedPath)
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${requestedPath}`)
  }

  const content = fs.readFileSync(resolvedPath, 'utf8')
  const relativePath = path.relative(context.cwd, resolvedPath) || path.basename(resolvedPath)

  return [
    'SymbolWright read',
    '',
    `Path: ${relativePath}`,
    '',
    '```text',
    content,
    '```',
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

export const readFileTool: RuntimeToolDefinition = {
  name: 'read_file',
  description: 'Read an allowed workspace file without mutating it.',
  capability: 'READ',
  execute: async (input, context) => executeReadFileTool(parseReadFileInput(input), context),
}
