import path from 'node:path'

import type { RepositoryValidationCommand } from './repository-portability.js'

const PREFIX = 'symbolwright-cwd:'
const SEPARATOR = '::'

export interface PortableValidationInvocation {
  readonly command: string
  readonly workingDirectory: string
}

export function encodePortableValidationInvocation(
  entry: Pick<RepositoryValidationCommand, 'command' | 'workingDirectory'>,
): string {
  const workingDirectory = normalizeWorkingDirectory(entry.workingDirectory)
  return workingDirectory === '.'
    ? entry.command
    : `${PREFIX}${workingDirectory}${SEPARATOR}${entry.command}`
}

export function parsePortableValidationInvocation(value: string): PortableValidationInvocation {
  const trimmed = value.trim()
  if (!trimmed.startsWith(PREFIX)) return { command: trimmed, workingDirectory: '.' }
  const separatorIndex = trimmed.indexOf(SEPARATOR, PREFIX.length)
  if (separatorIndex === -1) throw new Error('Portable validation invocation is malformed.')
  const workingDirectory = normalizeWorkingDirectory(trimmed.slice(PREFIX.length, separatorIndex))
  const command = trimmed.slice(separatorIndex + SEPARATOR.length).trim()
  if (command.length === 0) throw new Error('Portable validation invocation has no command.')
  return { command, workingDirectory }
}

export function resolvePortableValidationRoot(
  repositoryRoot: string,
  workingDirectory: string,
): string {
  const root = path.resolve(repositoryRoot)
  const resolved = path.resolve(root, normalizeWorkingDirectory(workingDirectory))
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Portable validation working directory escaped the repository root.')
  }
  return resolved
}

function normalizeWorkingDirectory(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '') || '.'
  if (normalized === '.') return normalized
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe portable validation working directory: ${value}`)
  }
  return normalized.replace(/\/$/, '') || '.'
}
