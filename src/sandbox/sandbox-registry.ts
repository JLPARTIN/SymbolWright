import {
  CODE_RUNNER_DEFINITIONS,
  UNIVERSAL_LANGUAGE_REGISTRY,
  type CodeRunnerDefinition,
} from '../workspace/language-registry.js'
import { STRONG_SANDBOX_NODE_IMAGE_ID, buildSandboxImagePolicy } from './sandbox-images.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import type {
  SandboxImageDefinition,
  SandboxInventory,
  SandboxNetworkPolicy,
  SandboxRunnerAvailability,
  SandboxRunnerCapabilities,
  SandboxRunnerDefinition,
} from './sandbox-types.js'

const AVAILABLE_NOW = '1970-01-01T00:00:00.000Z'
export const STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID = 'container-javascript-node26'

const BROWSER_CAPABILITIES: SandboxRunnerCapabilities = {
  run: true,
  compile: false,
  test: false,
  stdin: false,
  multiFile: false,
  repository: false,
  network: false,
}

const PREVIEW_CAPABILITIES: SandboxRunnerCapabilities = {
  run: false,
  compile: false,
  test: false,
  stdin: false,
  multiFile: false,
  repository: false,
  network: false,
}

const GUARDED_HOST_CAPABILITIES: SandboxRunnerCapabilities = {
  run: true,
  compile: true,
  test: true,
  stdin: true,
  multiFile: true,
  repository: true,
  network: false,
}

const STRONG_CONTAINER_CAPABILITIES: SandboxRunnerCapabilities = {
  run: true,
  compile: true,
  test: true,
  stdin: true,
  multiFile: true,
  repository: true,
  network: false,
}

export function runnerAvailability(
  status: SandboxRunnerAvailability['status'],
  checkedAt: string,
  details: { readonly version?: string; readonly reason?: string } = {},
): SandboxRunnerAvailability {
  return {
    status,
    checkedAt,
    ...(details.version === undefined ? {} : { version: details.version }),
    ...(details.reason === undefined ? {} : { reason: details.reason }),
  }
}

function languagesForRunner(runner: CodeRunnerDefinition): readonly string[] {
  return UNIVERSAL_LANGUAGE_REGISTRY.filter((language) => language.runnerId === runner.id).map(
    (language) => language.id,
  )
}

function browserAvailability(runner: CodeRunnerDefinition, now: string): SandboxRunnerAvailability {
  if (runner.id === 'server-typescript-node') {
    return runnerAvailability('available', now, {
      reason:
        'Legacy server TypeScript execution is trusted local host break-glass, not a strong sandbox.',
    })
  }
  return runnerAvailability('available', now)
}

function browserRunner(runner: CodeRunnerDefinition, now: string): SandboxRunnerDefinition {
  const preview = runner.capability === 'preview-only'
  return {
    id: runner.id,
    languageIds: languagesForRunner(runner),
    displayName: runner.label,
    trustClass: 'browser-isolated',
    backend: 'browser',
    availability: browserAvailability(runner, now),
    capabilities: preview ? PREVIEW_CAPABILITIES : BROWSER_CAPABILITIES,
    limits: DEFAULT_SANDBOX_LIMITS,
    networkPolicy: 'disabled',
    dependencyState: 'ready',
    notes: runner.safetyRestrictions,
  }
}

function strongContainerRunner(options: {
  readonly image: SandboxImageDefinition
  readonly engine: ReturnType<typeof buildSandboxImagePolicy>['engine']
  readonly generatedAt: string
}): SandboxRunnerDefinition {
  const available = options.image.enabled && options.engine.status === 'available'
  const engine = options.engine.engine === 'podman' ? 'podman' : 'docker'
  const reason = !options.image.enabled
    ? 'Strong container execution is disabled by operator policy.'
    : options.engine.status !== 'available'
      ? options.engine.reason
      : 'The container engine is available; the preinstalled image digest is verified before every execution.'
  return {
    id: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
    languageIds: ['javascript'],
    displayName: 'Strong Offline JavaScript Container',
    trustClass: 'container-isolated',
    backend: 'container',
    availability: runnerAvailability(
      available ? 'available' : options.engine.status,
      options.generatedAt,
      {
        ...(options.engine.version === undefined ? {} : { version: options.engine.version }),
        reason,
      },
    ),
    capabilities: STRONG_CONTAINER_CAPABILITIES,
    limits: DEFAULT_SANDBOX_LIMITS,
    networkPolicy: 'disabled',
    dependencyState: 'ready',
    container: {
      engine,
      imageId: options.image.id,
      image: options.image.image,
      digest: options.image.digest!,
      user: '65532:65532',
      pullPolicy: 'never',
      networkMode: 'none',
      workspaceMode: 'copy-in-tmpfs-copy-out',
    },
    notes: [
      'Uses a digest-pinned image with --pull=never.',
      'The canonical repository is copied into a private bounded workspace and is never mounted.',
      'The container root filesystem is read-only; only /workspace and /tmp are quota-bounded tmpfs mounts.',
      'Runs as a numeric non-root user with all capabilities dropped and no-new-privileges.',
      'Network, host PID/IPC, engine sockets, host home, provider credentials, and ambient proxy variables are unavailable.',
      'Generated files are copied only to bounded artifact quarantine.',
    ],
  }
}

function guardedHostRunner(
  languageId: string,
  displayName: string,
  availability: SandboxRunnerAvailability,
  networkPolicy: SandboxNetworkPolicy = 'disabled',
): SandboxRunnerDefinition {
  return {
    id: `guarded-host-${languageId}`,
    languageIds: [languageId],
    displayName,
    trustClass: 'guarded-host',
    backend: 'guarded-host',
    availability,
    capabilities: GUARDED_HOST_CAPABILITIES,
    limits: DEFAULT_SANDBOX_LIMITS,
    networkPolicy,
    dependencyState: availability.status === 'available' ? 'ready' : 'unsupported',
    notes: [
      'Guarded-host is trusted local host execution, not a strong sandbox.',
      'It does not enforce host network or full host filesystem isolation.',
      'It remains disabled unless APPROVED_EXECUTION and SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true are both present.',
      'The HTTP sandbox API and sandbox_execute agent tool reject guarded-host runners.',
      'No inherited secrets, shell interpolation, arbitrary executable paths, or dependency installation are allowed.',
    ],
  }
}

function missingCommandAvailability(command: string, checkedAt: string): SandboxRunnerAvailability {
  return runnerAvailability('unavailable', checkedAt, {
    reason: `${command} was not detected.`,
  })
}

function disabledGuardedHostAvailability(
  command: string,
  checkedAt: string,
  discovered: SandboxRunnerAvailability | undefined,
): SandboxRunnerAvailability {
  if (discovered?.status === 'available') {
    return runnerAvailability('unavailable', checkedAt, {
      ...(discovered.version === undefined ? {} : { version: discovered.version }),
      reason: `${command} was detected, but trusted local host break-glass execution is disabled by default.`,
    })
  }
  return runnerAvailability('unavailable', checkedAt, {
    reason:
      discovered?.reason === undefined
        ? 'Trusted local host break-glass execution is disabled by default.'
        : `Trusted local host break-glass execution is disabled by default. Discovery: ${discovered.reason}`,
  })
}

export interface BuildSandboxInventoryOptions {
  readonly now?: () => Date
  readonly commandAvailability?: ReadonlyMap<string, SandboxRunnerAvailability>
  readonly env?: NodeJS.ProcessEnv
}

export function buildSandboxInventory(
  options: BuildSandboxInventoryOptions = {},
): SandboxInventory {
  const now = options.now ?? (() => new Date())
  const generatedAt = now().toISOString()
  const commandAvailability =
    options.commandAvailability ?? new Map<string, SandboxRunnerAvailability>()
  const env = options.env ?? process.env
  const imagePolicy = buildSandboxImagePolicy(commandAvailability, env)
  const guardedHostOptIn = env['SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION'] === 'true'
  const strongImage = imagePolicy.images.find((image) => image.id === STRONG_SANDBOX_NODE_IMAGE_ID)!

  const containerRunners = [
    strongContainerRunner({ image: strongImage, engine: imagePolicy.engine, generatedAt }),
  ]
  const browserRunners = CODE_RUNNER_DEFINITIONS.filter(
    (runner) => runner.id !== 'server-typescript-node',
  ).map((runner) => browserRunner(runner, generatedAt))

  const guardedCandidates = [
    ['javascript', 'Guarded JavaScript Node Runner', 'node'],
    ['typescript', 'Guarded TypeScript Node Runner', 'node'],
    ['python', 'Guarded Python Runner', 'python3'],
    ['go', 'Guarded Go Runner', 'go'],
    ['rust', 'Guarded Rust Runner', 'rustc'],
    ['java', 'Guarded Java Runner', 'javac'],
    ['ruby', 'Guarded Ruby Runner', 'ruby'],
    ['php', 'Guarded PHP CLI Runner', 'php'],
    ['c', 'Guarded C Compiler Runner', 'gcc'],
    ['cpp', 'Guarded C++ Compiler Runner', 'g++'],
    ['r', 'Guarded Rscript Runner', 'Rscript'],
  ] as const

  const guardedRunners = guardedCandidates.map(([languageId, displayName, command]) => {
    const discovered = commandAvailability.get(command)
    return guardedHostRunner(
      languageId,
      displayName,
      guardedHostOptIn
        ? (discovered ?? missingCommandAvailability(command, generatedAt))
        : disabledGuardedHostAvailability(command, generatedAt, discovered),
    )
  })

  return {
    schemaVersion: 1,
    generatedAt,
    runners: [...containerRunners, ...browserRunners, ...guardedRunners],
    images: imagePolicy.images,
    warnings: [
      ...imagePolicy.warnings,
      'Guarded-host runners are trusted local host break-glass only; HTTP and agent-tool execution reject them.',
      'Runtime discovery uses bounded version probes only; it does not execute repository code or install dependencies.',
    ],
  }
}

export function findSandboxRunner(
  inventory: SandboxInventory,
  languageId: string,
  requestedRunnerId?: string,
): SandboxRunnerDefinition | undefined {
  if (requestedRunnerId !== undefined) {
    return inventory.runners.find(
      (runner) => runner.id === requestedRunnerId && runner.languageIds.includes(languageId),
    )
  }

  return inventory.runners.find(
    (runner) =>
      runner.languageIds.includes(languageId) &&
      runner.availability.status === 'available' &&
      runner.trustClass !== 'guarded-host',
  )
}

export function listSandboxLanguageIds(): readonly string[] {
  return UNIVERSAL_LANGUAGE_REGISTRY.map((language) => language.id)
}

export function listSandboxRunnerIds(inventory: SandboxInventory): readonly string[] {
  return inventory.runners.map((runner) => runner.id)
}

export const STATIC_SANDBOX_INVENTORY_FOR_TESTS = buildSandboxInventory({
  now: () => new Date(AVAILABLE_NOW),
  env: {},
  commandAvailability: new Map(),
})
