import fs from 'node:fs'
import path from 'node:path'

export interface AtomicWriteFileOptions {
  readonly mode?: number
}

/**
 * Writes `content` to `targetPath` by writing a temp file in the same
 * directory and then `rename`-ing it into place. `rename` on the same
 * filesystem is atomic, so a crash or thrown error between the write and
 * the rename leaves `targetPath` exactly as it was -- never truncated or
 * partially written. Lifts the temp-file+rename pattern already used by
 * `mission-store.ts` and `repository-semantic-index-store.ts` into one
 * shared helper for every file-mutation path.
 */
export function atomicWriteFile(
  targetPath: string,
  content: string,
  options: AtomicWriteFileOptions = {},
): void {
  const dir = path.dirname(targetPath)
  fs.mkdirSync(dir, { recursive: true })

  const tempPath = path.join(
    dir,
    `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`,
  )

  try {
    fs.writeFileSync(
      tempPath,
      content,
      options.mode === undefined ? { encoding: 'utf8' } : { encoding: 'utf8', mode: options.mode },
    )
    fs.renameSync(tempPath, targetPath)
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath)
      } catch {
        // Best-effort cleanup; the original error is what matters.
      }
    }
    throw error
  }
}
