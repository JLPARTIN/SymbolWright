import {
  CODE_RUNNER_DEFINITIONS,
  UNIVERSAL_LANGUAGE_REGISTRY,
  type CodeRunnerDefinition,
} from '../workspace/language-registry.js'
import { buildSandboxImagePolicy } from './sandbox-images.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import type {
  SandboxInventory,
  SandboxNetworkPolicy,
  SandboxRunnerAvailability,
  SandboxRunnerCapabilities,
  SandboxRunnerDefinition,
} from './sandbox-types.js'

const AVAILABLE_NOW = '1970-01-01T00:00:00.000Z'

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
        'Legacy server TypeScript runner is guarded-host and must be routed through Bundle 4 policy before execution.',
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
      'Guarded-host is not a strong sandbox.',
      'It remains disabled unless APPROVED_EXECUTION and CODEMIND_ALLOW_GUARDED_HOST_EXECUTION=true are both present.',
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
      reason: `${command} was detected, but guarded-host execution is disabled by default.`,
    })
  }
  return runnerAvailability('unavailable', checkedAt, {
    reason:
      discovered?.reason === undefined
        ? 'Guarded-host execution is disabled by default.'
        : `Guarded-host execution is disabled by default. Discovery: ${discovered.reason}`,
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
  const imagePolicy = buildSandboxImagePolicy(commandAvailability)
  const guardedHostOptIn = options.env?.['CODEMIND_ALLOW_GUARDED_HOST_EXECUTION'] === 'true'

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
    runners: [...browserRunners, ...guardedRunners],
    images: imagePolicy.images,
    warnings: [
      ...imagePolicy.warnings,
      'Guarded-host runners require explicit opt-in and APPROVED_EXECUTION before code can run.',
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
