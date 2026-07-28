import path from 'node:path'

import { buildSandboxContainerPolicyPlan } from './sandbox-container-policy.js'
import type { SandboxContainerPolicyPlan } from './sandbox-container-policy.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import type { SandboxImageDefinition, SandboxLimits } from './sandbox-types.js'

export interface SandboxContainerCommandPlanOptions {
  readonly image: SandboxImageDefinition
  readonly engine: SandboxContainerEngineStatus
  readonly hostWorkspacePath: string
  readonly hostOutputPath: string
  readonly containerName: string
  readonly entrypoint: readonly string[]
  readonly limits?: Partial<SandboxLimits>
  readonly user?: string
}

export interface SandboxContainerCommandPlan {
  readonly schemaVersion: 2
  readonly executionEnabled: true
  readonly engine: 'docker' | 'podman'
  readonly imageId: string
  readonly image: string
  readonly digest: string
  readonly containerName: string
  readonly trustClass: 'container-isolated'
  readonly backend: 'container'
  readonly containerWorkspacePath: '/workspace'
  readonly workingDirectory: '/workspace'
  readonly commands: {
    readonly inspectImage: readonly string[]
    readonly create: readonly string[]
    readonly start: readonly string[]
    readonly copyIn: readonly string[]
    readonly execute: readonly string[]
    readonly copyOut: readonly string[]
    readonly kill: readonly string[]
    readonly remove: readonly string[]
  }
  readonly policy: SandboxContainerPolicyPlan
  readonly warnings: readonly string[]
}

const ALLOWED_OPTION_KEYS = new Set([
  'image',
  'engine',
  'hostWorkspacePath',
  'hostOutputPath',
  'containerName',
  'entrypoint',
  'limits',
  'user',
])
const SAFE_CONTAINER_PATH = '/workspace' as const
const DEFAULT_NON_ROOT_USER = '65532:65532'
const MINIMAL_CONTAINER_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
const MIN_WORKSPACE_TMPFS_BYTES = 8 * 1024 * 1024
const MAX_WORKSPACE_TMPFS_BYTES = 1024 * 1024 * 1024

export function buildSandboxContainerCommandPlan(
  options: SandboxContainerCommandPlanOptions,
): SandboxContainerCommandPlan {
  assertNoUnknownContainerPlanOptions(options)
  assertAvailableContainerEngine(options.engine)
  assertPinnedImage(options.image)
  assertSafeEntrypoint(options.entrypoint)
  const hostWorkspacePath = assertSafeHostPath(options.hostWorkspacePath)
  const hostOutputPath = assertSafeHostPath(options.hostOutputPath)
  const containerName = assertSafeContainerName(options.containerName)
  const user = assertSafeUser(options.user ?? DEFAULT_NON_ROOT_USER)
  const policy = buildSandboxContainerPolicyPlan({
    image: { ...options.image, installed: true },
    engine: options.engine,
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  })
  if (!policy.executionEnabled) {
    throw new Error(`Container policy is not executable: ${policy.blockedReasons.join(' ')}`)
  }

  const engine = options.engine.engine
  const workspaceTmpfsBytes = Math.min(
    MAX_WORKSPACE_TMPFS_BYTES,
    Math.max(
      MIN_WORKSPACE_TMPFS_BYTES,
      policy.limits.maxTotalSourceBytes + policy.limits.maxArtifactBytes + 4 * 1024 * 1024,
    ),
  )
  const cpuCount = Math.max(0.01, (policy.limits.maxCpuPercent ?? 100) / 100)
  const image = options.image.image
  const commands = {
    inspectImage: [engine, 'image', 'inspect', '--format', '{{json .RepoDigests}}', image],
    create: [
      engine,
      'create',
      '--pull=never',
      '--name',
      containerName,
      '--label',
      'symbolwright.sandbox.managed=true',
      '--label',
      `symbolwright.sandbox.execution=${containerName}`,
      '--network',
      'none',
      // Docker and Podman use a private PID namespace by default. No caller-controlled --pid value
      // is accepted; omitting the flag avoids the invalid Docker `--pid private` spelling while
      // still forbidding host or container-shared PID namespaces.
      '--ipc',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--user',
      user,
      '--cpus',
      String(cpuCount),
      '--memory',
      `${policy.limits.maxMemoryMb}m`,
      '--memory-swap',
      `${policy.limits.maxMemoryMb}m`,
      '--pids-limit',
      String(policy.limits.maxProcesses),
      '--tmpfs',
      `/workspace:rw,nosuid,nodev,size=${workspaceTmpfsBytes},mode=1777`,
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777',
      '--workdir',
      SAFE_CONTAINER_PATH,
      '--hostname',
      'symbolwright-sandbox',
      '--env',
      'HOME=/tmp',
      '--env',
      'TMPDIR=/tmp',
      '--env',
      'LANG=C.UTF-8',
      '--env',
      `PATH=${MINIMAL_CONTAINER_PATH}`,
      '--init',
      image,
      'sh',
      '-c',
      'while :; do sleep 3600; done',
    ],
    start: [engine, 'start', containerName],
    copyIn: [engine, 'cp', `${hostWorkspacePath}${path.sep}.`, `${containerName}:/workspace`],
    execute: [
      engine,
      'exec',
      '-i',
      '--user',
      user,
      '--workdir',
      SAFE_CONTAINER_PATH,
      '--env',
      'HOME=/tmp',
      '--env',
      'TMPDIR=/tmp',
      '--env',
      `PATH=${MINIMAL_CONTAINER_PATH}`,
      containerName,
      ...options.entrypoint,
    ],
    copyOut: [engine, 'cp', `${containerName}:/workspace/.`, hostOutputPath],
    kill: [engine, 'kill', '--signal', 'KILL', containerName],
    remove: [engine, 'rm', '--force', '--volumes', containerName],
  } as const

  return {
    schemaVersion: 2,
    executionEnabled: true,
    engine,
    imageId: options.image.id,
    image,
    digest: options.image.digest!,
    containerName,
    trustClass: 'container-isolated',
    backend: 'container',
    containerWorkspacePath: SAFE_CONTAINER_PATH,
    workingDirectory: SAFE_CONTAINER_PATH,
    commands,
    policy,
    warnings: [
      'The canonical repository is never mounted into the container.',
      'Source is copied into a size-bounded tmpfs workspace and copied out only to quarantine.',
      'Normal execution uses --pull=never and requires a preinstalled digest-pinned image.',
      'Private PID isolation is enforced by excluding host and container-shared PID modes.',
      'Browser and model requests cannot add mounts, engine flags, environment variables, or image names.',
      ...policy.warnings,
    ],
  }
}

export function isSandboxContainerCommandPlanExecutable(
  plan: SandboxContainerCommandPlan,
): boolean {
  return plan.executionEnabled && plan.policy.executionEnabled
}

function assertNoUnknownContainerPlanOptions(options: SandboxContainerCommandPlanOptions): void {
  for (const key of Object.keys(options as unknown as Record<string, unknown>)) {
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

function assertPinnedImage(image: SandboxImageDefinition): void {
  if (
    image.digest === undefined ||
    !/^sha256:[a-f0-9]{64}$/.test(image.digest) ||
    !image.image.endsWith(`@${image.digest}`)
  ) {
    throw new Error('Container execution requires an allowlisted digest-pinned image reference.')
  }
  if (!image.enabled) throw new Error('Sandbox image is not enabled by operator policy.')
}

function assertSafeHostPath(hostPath: string): string {
  if (hostPath.includes('\0')) throw new Error('Container host path may not contain null bytes.')
  if (!path.isAbsolute(hostPath)) throw new Error('Container host path must be absolute.')
  const normalized = path.normalize(hostPath)
  if (normalized === path.parse(normalized).root) {
    throw new Error('Container host path may not be the filesystem root.')
  }
  const deniedFragments = [
    `${path.sep}.git`,
    `${path.sep}home${path.sep}`,
    `${path.sep}root${path.sep}`,
    `${path.sep}var${path.sep}run${path.sep}docker.sock`,
    `${path.sep}run${path.sep}docker.sock`,
    `${path.sep}run${path.sep}podman${path.sep}podman.sock`,
  ]
  if (deniedFragments.some((fragment) => normalized.includes(fragment))) {
    throw new Error('Container host path may not target host home, Git, or engine socket paths.')
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

function assertSafeContainerName(value: string): string {
  if (!/^symbolwright-sandbox-[a-z0-9][a-z0-9-]{0,80}$/.test(value)) {
    throw new Error('Container name is not a valid SymbolWright-managed sandbox name.')
  }
  return value
}

function assertSafeUser(value: string): string {
  if (!/^[1-9][0-9]*:[1-9][0-9]*$/.test(value)) {
    throw new Error('Container execution requires a numeric non-root uid:gid pair.')
  }
  return value
}
