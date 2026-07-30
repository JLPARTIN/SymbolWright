import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { resolveStoragePaths } from '../storage/storage-paths.js'
import { DependencyLayerBindingStore } from './dependency-layer-binding-store.js'
import type { DependencyPolicyProfile } from './dependency-policy.js'
import type { EgressPolicyProfile } from './egress-policy.js'
import { SandboxNetworkGateway } from './sandbox-network-gateway.js'
import type { SandboxPolicyReference } from './sandbox-policy-model.js'

export const SANDBOX_NETWORK_POLICY_FILE_ENV = 'SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE' as const
export const SANDBOX_NETWORK_POLICY_SCHEMA_VERSION = 1 as const
const MAX_POLICY_FILE_BYTES = 1024 * 1024

export interface SandboxNetworkPolicyDocument {
  readonly schemaVersion: typeof SANDBOX_NETWORK_POLICY_SCHEMA_VERSION
  readonly dependencyProfiles?: readonly DependencyPolicyProfile[]
  readonly defaultDependencyPolicy?: SandboxPolicyReference
  readonly egressProfiles?: readonly EgressPolicyProfile[]
}

export interface SandboxNetworkRuntimeStatus {
  readonly mode: 'offline-only' | 'configured'
  readonly stateRoot: string
  readonly policyFile?: string
  readonly dependencyProfileCount: number
  readonly defaultDependencyPolicy?: string
  readonly egressProfileCount: number
}

export interface ApplicationSandboxNetworkRuntime {
  readonly gateway: SandboxNetworkGateway
  readonly dependencyLayers: DependencyLayerBindingStore
  readonly defaultDependencyPolicyReference?: SandboxPolicyReference
  readonly status: SandboxNetworkRuntimeStatus
}

export interface ApplicationSandboxNetworkRuntimeOptions {
  readonly workspaceRoot: string
  readonly env?: NodeJS.ProcessEnv
}

const runtimes = new Map<string, ApplicationSandboxNetworkRuntime>()

/**
 * Returns the one application-owned network runtime for a workspace. Policy is loaded once per
 * process so later environment or file changes cannot silently widen authority underneath an
 * already-running server, agent, autonomous mission, or MCP process.
 */
export function getOrCreateApplicationSandboxNetworkRuntime(
  options: ApplicationSandboxNetworkRuntimeOptions,
): ApplicationSandboxNetworkRuntime {
  const workspaceRoot = path.resolve(requireNonEmpty(options.workspaceRoot, 'workspaceRoot'))
  const existing = runtimes.get(workspaceRoot)
  if (existing !== undefined) return existing

  const env = options.env ?? process.env
  const stateRoot = path.join(resolveStoragePaths(workspaceRoot).workspaceRoot, 'sandbox-network')
  const loaded = loadPolicyDocument(workspaceRoot, env)
  const dependencyProfiles = loaded.document?.dependencyProfiles ?? []
  const defaultDependencyPolicyReference = loaded.document?.defaultDependencyPolicy
  const egressProfiles = loaded.document?.egressProfiles ?? []
  validateDefaultDependencyPolicy(defaultDependencyPolicyReference, dependencyProfiles)

  const runtime: ApplicationSandboxNetworkRuntime = {
    gateway: new SandboxNetworkGateway({
      stateRoot,
      dependencyProfiles,
      egressProfiles,
      env,
    }),
    dependencyLayers: new DependencyLayerBindingStore(path.join(stateRoot, 'dependency-bindings')),
    ...(defaultDependencyPolicyReference === undefined ? {} : { defaultDependencyPolicyReference }),
    status: Object.freeze({
      mode: loaded.policyFile === undefined ? 'offline-only' : 'configured',
      stateRoot,
      ...(loaded.policyFile === undefined ? {} : { policyFile: loaded.policyFile }),
      dependencyProfileCount: dependencyProfiles.length,
      ...(defaultDependencyPolicyReference === undefined
        ? {}
        : {
            defaultDependencyPolicy: `${defaultDependencyPolicyReference.id}@${defaultDependencyPolicyReference.version}`,
          }),
      egressProfileCount: egressProfiles.length,
    }),
  }
  runtimes.set(workspaceRoot, runtime)
  return runtime
}

export function sandboxNetworkReadinessDetail(status: SandboxNetworkRuntimeStatus): string {
  if (status.mode === 'offline-only') {
    return 'offline-only; no sandbox network policy file is configured'
  }
  return `configured; dependencyProfiles=${status.dependencyProfileCount}; defaultDependencyPolicy=${status.defaultDependencyPolicy ?? 'none'}; egressProfiles=${status.egressProfileCount}`
}

/** Test-only process isolation seam. Production callers must not reload authority in place. */
export function clearApplicationSandboxNetworkRuntimesForTests(): void {
  runtimes.clear()
}

function loadPolicyDocument(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv,
): { readonly policyFile?: string; readonly document?: SandboxNetworkPolicyDocument } {
  const configured = env[SANDBOX_NETWORK_POLICY_FILE_ENV]?.trim()
  if (configured === undefined || configured.length === 0) return {}

  const policyFile = path.resolve(workspaceRoot, configured)
  const stat = lstatSync(policyFile)
  if (stat.isSymbolicLink()) {
    throw new Error(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} must reference a regular file, not a symlink.`,
    )
  }
  if (!stat.isFile()) {
    throw new Error(`${SANDBOX_NETWORK_POLICY_FILE_ENV} must reference a regular file.`)
  }
  if (stat.size > MAX_POLICY_FILE_BYTES) {
    throw new Error(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} exceeds the ${MAX_POLICY_FILE_BYTES}-byte limit.`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(policyFile, 'utf8'))
  } catch (error) {
    throw new Error(
      `Unable to parse ${SANDBOX_NETWORK_POLICY_FILE_ENV}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${SANDBOX_NETWORK_POLICY_FILE_ENV} must contain a JSON object.`)
  }

  const record = parsed as Record<string, unknown>
  if (record['schemaVersion'] !== SANDBOX_NETWORK_POLICY_SCHEMA_VERSION) {
    throw new Error(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} schemaVersion must be ${SANDBOX_NETWORK_POLICY_SCHEMA_VERSION}.`,
    )
  }
  const dependencyProfiles = optionalArray(record['dependencyProfiles'], 'dependencyProfiles')
  const defaultDependencyPolicy = optionalPolicyReference(
    record['defaultDependencyPolicy'],
    'defaultDependencyPolicy',
  )
  const egressProfiles = optionalArray(record['egressProfiles'], 'egressProfiles')

  return {
    policyFile,
    document: {
      schemaVersion: SANDBOX_NETWORK_POLICY_SCHEMA_VERSION,
      ...(dependencyProfiles === undefined
        ? {}
        : { dependencyProfiles: dependencyProfiles as readonly DependencyPolicyProfile[] }),
      ...(defaultDependencyPolicy === undefined ? {} : { defaultDependencyPolicy }),
      ...(egressProfiles === undefined
        ? {}
        : { egressProfiles: egressProfiles as readonly EgressPolicyProfile[] }),
    },
  }
}

function validateDefaultDependencyPolicy(
  reference: SandboxPolicyReference | undefined,
  profiles: readonly DependencyPolicyProfile[],
): void {
  if (reference === undefined) return
  const matching = profiles.find(
    (profile) =>
      profile.id === reference.id && profile.version === reference.version && profile.enabled,
  )
  if (matching === undefined) {
    throw new Error(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} defaultDependencyPolicy must reference an enabled installed dependency profile.`,
    )
  }
}

function optionalArray(value: unknown, name: string): readonly unknown[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error(`${SANDBOX_NETWORK_POLICY_FILE_ENV} field ${name} must be an array.`)
  }
  return value
}

function optionalPolicyReference(value: unknown, name: string): SandboxPolicyReference | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${SANDBOX_NETWORK_POLICY_FILE_ENV} field ${name} must be an object.`)
  }
  const record = value as Record<string, unknown>
  if (
    typeof record['id'] !== 'string' ||
    record['id'].trim().length === 0 ||
    typeof record['version'] !== 'number' ||
    !Number.isSafeInteger(record['version']) ||
    record['version'] <= 0
  ) {
    throw new Error(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} field ${name} requires a non-empty id and positive integer version.`,
    )
  }
  return { id: record['id'], version: record['version'] }
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${name} must not be empty.`)
  return normalized
}
