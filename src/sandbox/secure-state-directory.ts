import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Creates a private directory tree without ever following a symlinked path component. This is
 * intended for durable security evidence and content-addressed state owned by SymbolWright.
 */
export async function ensureSecureStateDirectory(directory: string): Promise<void> {
  const absolute = path.resolve(directory)
  const parsed = path.parse(absolute)
  const relative = path.relative(parsed.root, absolute)
  let current = parsed.root

  for (const segment of relative.split(path.sep).filter((entry) => entry.length > 0)) {
    const next = path.join(current, segment)
    let stat = await safeLstat(next)
    if (stat === undefined) {
      try {
        await fs.mkdir(next, { mode: 0o700 })
      } catch (error) {
        if (!isAlreadyExists(error)) throw error
      }
      stat = await fs.lstat(next)
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Secure state directory contains a non-directory or symbolic-link component.')
    }
    current = next
  }
}

async function safeLstat(target: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | undefined> {
  try {
    return await fs.lstat(target)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
