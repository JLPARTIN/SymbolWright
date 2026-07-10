import { spawn } from 'node:child_process'

export interface GitCommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
}

/**
 * Runs a raw `git` command and captures stdout/stderr. Shared by the
 * `git` runtime tool (`git-execute-tool.ts`, LLM-facing) and the
 * Repository API routes (`src/app/api/repository-routes.ts`, HTTP-facing)
 * so there is exactly one place that spawns `git` — previously this was a
 * file-private function inside `git-execute-tool.ts` with no way to reuse
 * it outside the tool-call interface.
 */
export function runGitCommand(
  args: readonly string[],
  cwd: string,
  timeoutMs = 60_000,
): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args as string[], {
      cwd,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode: code,
      })
    })

    child.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      })
    })
  })
}
