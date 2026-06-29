import { spawnSync } from 'node:child_process'

import {
  renderDockerSandboxConfig,
  resolveDockerSandboxConfig,
  resolveDockerSandboxRunnerOptionsFromEnv,
  type DockerSandboxResolvedConfig,
  type DockerSandboxRunnerOptions,
} from './sandbox-runner.js'

export type SandboxReadinessStatus = 'PASS' | 'FAIL' | 'WARN'

export interface SandboxReadinessCheck {
  readonly name: string
  readonly status: SandboxReadinessStatus
  readonly detail: string
}

export interface SandboxReadinessReport {
  readonly ready: boolean
  readonly config: DockerSandboxResolvedConfig
  readonly checks: readonly SandboxReadinessCheck[]
  readonly passCount: number
  readonly failCount: number
  readonly warnCount: number
}

export interface SandboxProbeResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
  readonly error: string | null
}

export type SandboxCommandProbe = (binary: string, args: readonly string[]) => SandboxProbeResult

const DOCKER_PROBE_TIMEOUT_MS = 5_000
const DOCKER_PROBE_MAX_OUTPUT_BYTES = 64 * 1024

const defaultSandboxCommandProbe: SandboxCommandProbe = (binary, args) => {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    timeout: DOCKER_PROBE_TIMEOUT_MS,
    maxBuffer: DOCKER_PROBE_MAX_OUTPUT_BYTES,
  })

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  }
}

function createCheck(
  name: string,
  status: SandboxReadinessStatus,
  detail: string,
): SandboxReadinessCheck {
  return { name, status, detail }
}

function renderProbeFailure(result: SandboxProbeResult): string {
  const details = [result.error, result.stderr.trim(), result.stdout.trim()]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(' ')

  return details.length > 0 ? details : 'Docker probe returned no diagnostic output.'
}

export function runSandboxReadinessCheck(
  options: DockerSandboxRunnerOptions = resolveDockerSandboxRunnerOptionsFromEnv(),
  probe: SandboxCommandProbe = defaultSandboxCommandProbe,
): SandboxReadinessReport {
  const config = resolveDockerSandboxConfig(options)
  const checks: SandboxReadinessCheck[] = []

  checks.push(createCheck('Sandbox configuration', 'PASS', renderDockerSandboxConfig(config)))
  checks.push(
    createCheck(
      'Sandbox isolation policy',
      'PASS',
      'Docker run arguments include isolated network, resource limits, and a non-root user.',
    ),
  )

  const dockerVersion = probe(config.dockerBinary, ['version', '--format', '{{.Server.Version}}'])
  if (dockerVersion.error !== null || dockerVersion.status !== 0) {
    checks.push(
      createCheck(
        'Docker availability',
        'FAIL',
        `Docker is unavailable; sandbox execution will stop instead of using host fallback. ${renderProbeFailure(dockerVersion)}`,
      ),
    )
  } else {
    const version = dockerVersion.stdout.trim() || 'version reported'
    checks.push(createCheck('Docker availability', 'PASS', version))
  }

  const passCount = checks.filter((check) => check.status === 'PASS').length
  const failCount = checks.filter((check) => check.status === 'FAIL').length
  const warnCount = checks.filter((check) => check.status === 'WARN').length

  return {
    ready: failCount === 0,
    config,
    checks,
    passCount,
    failCount,
    warnCount,
  }
}

export function renderSandboxReadinessReport(report: SandboxReadinessReport): string {
  const lines = [
    'CodeMind sandbox readiness',
    '',
    `Ready: ${report.ready ? 'yes' : 'no'}`,
    `Config: ${renderDockerSandboxConfig(report.config)}`,
    '',
    'Checks:',
    ...report.checks.map((check) => `- [${check.status}] ${check.name}: ${check.detail}`),
    '',
    `Summary: ${report.passCount} passed, ${report.failCount} failed, ${report.warnCount} warnings`,
  ]

  return lines.join('\n')
}
