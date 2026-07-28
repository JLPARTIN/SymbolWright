/* v8 ignore file -- spawns real npm scripts; exercised manually through Codespaces forwarded-port preview. */

import { spawn } from 'node:child_process'

import { buildRuntimeStatusView, type RuntimeStatusView, type ScriptOutput } from './status.js'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export function runScript(
  name: string,
  script: string,
  args: readonly string[] = [],
): Promise<ScriptOutput> {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    const child = spawn(
      npmCommand,
      ['run', script, '--silent', ...(args.length === 0 ? [] : ['--', ...args])],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CI: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    let output = ''
    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 120_000)

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.on('close', (code) => {
      clearTimeout(timeout)

      resolve({
        name,
        exitCode: timedOut ? 124 : (code ?? 1),
        output: output.slice(-30_000),
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

export async function collectStatus(): Promise<RuntimeStatusView> {
  const [doctor, releaseReadiness] = await Promise.all([
    runScript('doctor', 'doctor'),
    runScript('release-readiness', 'release-readiness', ['--static']),
  ])

  return buildRuntimeStatusView(doctor, releaseReadiness)
}
