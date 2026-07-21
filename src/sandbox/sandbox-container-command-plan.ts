import path from 'node:path'

import {
  DEFAULT_SANDBOX_CONTAINER_CONTROLS,
  buildSandboxContainerPolicyPlan,
} from './sandbox-container-policy.js'
import type { SandboxContainerPolicyPlan } from './sandbox-container-policy.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import type { SandboxImageDefinition, SandboxLimits } from './sandbox-types.js'

export interface SandboxContainerCommandPlanOptions {
  readonly image: SandboxImageDefinition
  readonly engine: SandboxContainerEngineStatus
  readonly hostWorkspacePath: string
  readonly containerWorkspacePath?: string
  readonly entrypoint: readonly string[]
  readonly limits?: Partial<SandboxLimits>
}

export interface SandboxContainerCommandPlan {
  readonly schemaVersion: 1
  readonly executionEnabled: false
  readonly engine: 'docker' | 'podman'
  readonly imageId: string
  readonly image: string
  readonly trustClass: 'container-isolated'
  readonly backend: 'container'
  readonly argv: readonly string[]
  readonly hostWorkspacePath: string
  readonly containerWorkspacePath: string
  readonly workingDirectory: string
  readonly policy: SandboxContainerPolicyPlan
  readonly warnings: readonly string[]
}

const ALLOWED_OPTION_KEYS = new Set([
  'image',
  'engine',
  'hostWorkspacePath',
  'containerWorkspacePath',
  'entrypoint',
  'limits',
])

const SAFE_CONTAINER_PATH = '/workspace'
const NON_ROOT_USER = '65532:65532'
const MINIMAL_CONTAINER_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

function assertNoUnknownContainerPlanOptions(options: SandboxContainerCommandPlanOptions): void {
  for (const key of Object.keys(options as Record<string, unknown>)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) {
      throw new Error(`Arbitrary container option is not allowed: ${key}`)
    }
  }
}

function assertAvailableContainerEngine(
  engine: SandboxContainerEngineStatus,
): asserts engine is SandboxContainerEngineStatus & { readonly engine: 'docker' | 'podman' } {
  if ((engine.engine !== 'docker' && engine.engine !== 'podman') || engine.status !== 'available') {
    throw new Error('Container command plans require an available Docker or Podman engine.')
  }
}

function assertSafeHostWorkspacePath(hostWorkspacePath: string): string {
  if (hostWorkspacePath.includes('\0')) {
    throw new Error('Container workspace path may not contain null bytes.')
  }

  if (!path.isAbsolute(hostWorkspacePath)) {
    throw new Error('Container workspace path must be absolute.')
  }

  const normalized = path.normalize(hostWorkspacePath)
  if (normalized === '/' || normalized === path.parse(normalized).root) {
    throw new Error('Container workspace path may not be the filesystem root.')
  }

  const deniedFragments = [
    '/.git',
    '/home/',
    '/root/',
    '/var/run/docker.sock',
    '/run/docker.sock',
    '/run/podman/podman.sock',
  ]

  if (deniedFragments.some((fragment) => normalized.includes(fragment))) {
    throw new Error('Container workspace path may not target host home, Git, or engine socket paths.')
  }

  return normalized
}

function assertSafeEntrypoint(entrypoint: readonly string[]): void {
  if (entrypoint.length === 0) throw new Error('Container command plan requires an entrypoint.')
  for (const part of entrypoint) {
    if (part.length === 0 || part.includes('\0')) {
      throw new Error('Container entrypoint arguments must be non-empty and null-byte free.')
    }
  }
}

function containerMountArg(hostWorkspacePath: string, containerWorkspacePath: string): string {
  return `type=bind,src=${hostWorkspacePath},dst=${containerWorkspacePath},readonly=false`
}

function containerTmpfsArg(): string {
  return 'rw,noexec,nosuid,nodev,size=64m'
}

function buildContainerRunArgv(options: {
  readonly engine: 'docker' | 'podman'
  readonly image: string
  readonly hostWorkspacePath: string
  readonly containerWorkspacePath: string
  readonly entrypoint: readonly string[]
  readonly limits: SandboxLimits
}): readonly string[] {
  const cpuCount = Math.max(1, Math.ceil((options.limits.maxCpuPercent ?? 100) / 100))
  return [
    options.engine,
    'run',
    '--rm',
    '--pull=never',
    '--network',
    'none',
    '--pid',
    'private',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    NON_ROOT_USER,
    '--cpus',
    String(cpuCount),
    '--memory',
    `${options.limits.maxMemoryMb}m`,
    '--pids-limit',
    String(options.limits.maxProcesses),
    '--tmpfs',
    `/tmp:${containerTmpfsArg()}`,
    '--workdir',
    options.containerWorkspacePath,
    '--mount',
    containerMountArg(options.hostWorkspacePath, options.containerWorkspacePath),
    '--env',
    'HOME=/tmp',
    '--env',
    `PATH=${MINIMAL_CONTAINER_PATH}`,
    options.image,
    ...options.entrypoint,
  ]
}

export function buildSandboxContainerCommandPlan(
  options: SandboxContainerCommandPlanOptions,
): SandboxContainerCommandPlan {
  assertNoUnknownContainerPlanOptions(options)
  assertAvailableContainerEngine(options.engine)
  assertSafeEntrypoint(options.entrypoint)

  const hostWorkspacePath = assertSafeHostWorkspacePath(options.hostWorkspacePath)
  const containerWorkspacePath = options.containerWorkspacePath ?? SAFE_CONTAINER_PATH
  const policy = buildSandboxContainerPolicyPlan({
    image: options.image,
    engine: options.engine,
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  })

  const argv = buildContainerRunArgv({
    engine: options.engine.engine,
    image: options.image.image,
    hostWorkspacePath,
    containerWorkspacePath,
    entrypoint: options.entrypoint,
    limits: policy.limits,
  })

  return {
    schemaVersion: 1,
    executionEnabled: false,
    engine: options.engine.engine,
    imageId: options.image.id,
    image: options.image.image,
    trustClass: 'container-isolated',
    backend: 'container',
    argv,
    hostWorkspacePath,
    containerWorkspacePath,
    workingDirectory: containerWorkspacePath,
    policy,
    warnings: [
      'This command plan is review-only and is never executed by this slice.',
      'The future backend must enforce the policy plan before running this argv.',
      'Browser requests cannot add container flags, mounts, environment variables, or image names.',
      ...policy.warnings,
    ],
  }
}

export function assertContainerCommandPlanStaysNonExecutable(
  plan: SandboxContainerCommandPlan,
): false {
  void plan
  return DEFAULT_SANDBOX_CONTAINER_CONTROLS.networkPolicy === 'disabled' && false
}
