import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

const COMMAND_TIMEOUT_MS = 45_000

const CODEMIND_ROOT_CANDIDATES = [
  process.env.CODEMIND_ROOT,
  resolve(process.cwd(), '../..'),
  process.cwd(),
].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)

const COMMANDS: Record<string, readonly string[]> = {
  status: ['status'],
  doctor: ['doctor'],
  'release-readiness': ['release-readiness'],
  scan: ['scan', '.'],
  'project-context': ['project-context', '.'],
  'runtime-status': ['runtime-status'],
  'runtime-run-readonly': ['runtime', 'run'],
  'propose-patch': ['propose-patch'],
}

interface ExecuteRequest {
  readonly command: string
  readonly mission?: string
  readonly governance?: 'strict' | 'standard' | 'off'
}

function findCodeMindRoot(): string {
  for (const candidate of CODEMIND_ROOT_CANDIDATES) {
    if (existsSync(resolve(candidate, 'package.json')) && existsSync(resolve(candidate, 'src'))) {
      return candidate
    }
  }

  return process.cwd()
}

function buildArgs(command: string, mission?: string, governance?: string): string[] | null {
  const template = COMMANDS[command]
  if (template === undefined) {
    return null
  }

  const args = [...template]

  if (command === 'runtime-run-readonly' && mission !== undefined && mission.trim().length > 0) {
    args.push(mission.trim())
    if (governance !== 'off') {
      args.push('--read-only')
    }
  }

  if (command === 'propose-patch' && mission !== undefined && mission.trim().length > 0) {
    args.push(mission.trim())
  }

  return args
}

function runCodeMind(
  args: readonly string[],
  cwd: string,
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  return new Promise((resolveResult) => {
    const cliPath = resolve(cwd, 'dist', 'cli.js')
    const proc = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    proc.stdout.on('data', (data: Buffer) => chunks.push(data))
    proc.stderr.on('data', (data: Buffer) => errChunks.push(data))

    proc.on('close', (code) => {
      resolveResult({
        stdout: Buffer.concat(chunks).toString('utf8').slice(0, 80_000),
        stderr: Buffer.concat(errChunks).toString('utf8').slice(0, 20_000),
        exitCode: code ?? 1,
      })
    })

    proc.on('error', (error) => {
      resolveResult({ stdout: '', stderr: `Process error: ${error.message}`, exitCode: 1 })
    })
  })
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ExecuteRequest
  const { command, mission, governance } = body

  if (typeof command !== 'string' || command.length === 0) {
    return NextResponse.json({ error: 'Missing command field.', output: '' }, { status: 400 })
  }

  const args = buildArgs(command, mission, governance)
  if (args === null) {
    return NextResponse.json(
      {
        error: `Command "${command}" is not available. Available: ${Object.keys(COMMANDS).join(', ')}`,
        output: '',
      },
      { status: 400 },
    )
  }

  const cwd = findCodeMindRoot()
  const result = await runCodeMind(args, cwd)
  const output = [result.stdout, result.stderr.length > 0 ? `\n[stderr]\n${result.stderr}` : '']
    .join('')
    .trim()

  return NextResponse.json({
    output: output || '(no output)',
    exitCode: result.exitCode,
    command: `node dist/cli.js ${args.join(' ')}`,
    cwd,
    governance: governance ?? 'standard',
  })
}
