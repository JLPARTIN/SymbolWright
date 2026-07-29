import { createHash } from 'node:crypto'

import {
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
  canonicalSandboxCapabilityId,
} from '../access/sandbox-capabilities.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

export const SANDBOX_COMMAND_POLICY_SCHEMA_VERSION = 1 as const
export const SANDBOX_COMMAND_POLICY_VERSION = 1 as const

export const SANDBOX_COMMAND_PROFILE_IDS = [
  'trusted-local-runtime-node',
  'trusted-local-portable-node',
  'trusted-local-portable-python',
  'trusted-local-portable-go',
  'trusted-local-portable-rust',
  'trusted-local-portable-maven',
  'trusted-local-portable-gradle',
  'trusted-local-portable-dotnet',
  'trusted-local-portable-ruby',
  'trusted-local-portable-php',
] as const

export type SandboxCommandProfileId = (typeof SANDBOX_COMMAND_PROFILE_IDS)[number]
export type SandboxCommandWorkspaceTrust = 'trusted-local' | 'external-untrusted'

export interface SandboxCommandProfile {
  readonly id: SandboxCommandProfileId
  readonly version: typeof SANDBOX_COMMAND_POLICY_VERSION
  readonly image: string
  readonly allowedBinaries: readonly string[]
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

export interface SandboxCommandPolicyRequest {
  readonly command: string
  readonly workspaceRoot: string
  readonly workspaceTrust: SandboxCommandWorkspaceTrust
  readonly profileId: SandboxCommandProfileId
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
}

export interface ParsedSandboxCommand {
  readonly binary: string
  readonly args: readonly string[]
  readonly rendered: string
}

export interface EffectiveSandboxCommandPolicy {
  readonly schemaVersion: typeof SANDBOX_COMMAND_POLICY_SCHEMA_VERSION
  readonly policyId: SandboxCommandProfileId
  readonly policyVersion: typeof SANDBOX_COMMAND_POLICY_VERSION
  readonly fingerprint: string
  readonly resolvedAt: string
  readonly executionClass: 'trusted-local-container-compatibility'
  readonly deploymentMode: 'local'
  readonly callerKind: 'operator' | 'system'
  readonly capabilityId: typeof SANDBOX_OFFLINE_EXECUTE_CAPABILITY
  readonly command: ParsedSandboxCommand
  readonly image: string
  readonly imageReference: 'operator-controlled-mutable-compatibility'
  readonly workspace: {
    readonly mode: 'trusted-local-bind'
    readonly rootHash: string
    readonly trust: 'trusted-local'
  }
  readonly network: {
    readonly mode: 'disabled'
  }
  readonly limits: {
    readonly timeoutMs: number
    readonly maxOutputBytes: number
  }
  readonly controls: {
    readonly shell: false
    readonly readWriteRepositoryBind: true
    readonly hostFallback: false
    readonly dependencyAcquisition: false
    readonly egress: false
  }
}

export interface SandboxCommandPolicyDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly policy?: EffectiveSandboxCommandPolicy
}

const SHELL_META_PATTERN = /[;&|`$<>\n\r]/
const TRUSTED_LOCAL_COMMAND_TIMEOUT_MS = 300_000
const TRUSTED_LOCAL_COMMAND_MAX_OUTPUT_BYTES = 1024 * 1024

const PROFILE_DEFINITIONS: readonly SandboxCommandProfile[] = [
  profile('trusted-local-runtime-node', 'node:22-bookworm', [
    'git',
    'npm',
    'npx',
    'node',
    'prettier',
  ]),
  profile('trusted-local-portable-node', 'node:22-bookworm', ['npm', 'npx', 'node', 'prettier']),
  profile('trusted-local-portable-python', 'python:3.12-bookworm', ['python', 'python3', 'pytest']),
  profile('trusted-local-portable-go', 'golang:1-bookworm', ['go', 'gofmt']),
  profile('trusted-local-portable-rust', 'rust:1-bookworm', ['cargo', 'rustc']),
  profile('trusted-local-portable-maven', 'maven:3-eclipse-temurin-21', ['mvn', './mvnw']),
  profile('trusted-local-portable-gradle', 'gradle:8-jdk21', ['gradle', './gradlew']),
  profile('trusted-local-portable-dotnet', 'mcr.microsoft.com/dotnet/sdk:8.0', ['dotnet']),
  profile('trusted-local-portable-ruby', 'ruby:3.3-bookworm', ['ruby', 'bundle', 'rake']),
  profile('trusted-local-portable-php', 'composer:2', ['php', 'composer']),
]

const PROFILE_MAP: ReadonlyMap<SandboxCommandProfileId, SandboxCommandProfile> = new Map(
  PROFILE_DEFINITIONS.map((entry) => [entry.id, entry]),
)

export function listSandboxCommandProfiles(): readonly SandboxCommandProfile[] {
  return PROFILE_DEFINITIONS
}

export function getSandboxCommandProfile(
  profileId: SandboxCommandProfileId,
): SandboxCommandProfile | undefined {
  return PROFILE_MAP.get(profileId)
}

export function parseSandboxCommand(command: string): ParsedSandboxCommand {
  const rendered = command.trim()
  if (rendered.length === 0) throw new Error('Sandbox command must not be empty.')
  if (SHELL_META_PATTERN.test(rendered)) {
    throw new Error('Sandbox command contains shell metacharacters and was rejected.')
  }
  const [binary, ...args] = rendered.split(/\s+/)
  if (binary === undefined) throw new Error('Sandbox command must name an executable.')
  return { binary, args, rendered }
}

export function resolveEffectiveSandboxCommandPolicy(input: {
  readonly request: SandboxCommandPolicyRequest
  readonly authorization: SandboxAuthorizationContext
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
}): SandboxCommandPolicyDecision {
  const env = input.env ?? process.env
  if (env['SYMBOLWRIGHT_DISABLE_SANDBOX_EXECUTION'] === 'true') {
    return blocked(
      'SANDBOX_GLOBALLY_DISABLED',
      'Sandbox execution is disabled by the emergency global kill switch.',
    )
  }

  const approvedCapabilities = input.authorization.approvedCapabilityIds.map(
    canonicalSandboxCapabilityId,
  )
  if (!approvedCapabilities.includes(SANDBOX_OFFLINE_EXECUTE_CAPABILITY)) {
    return blocked(
      'SANDBOX_CAPABILITY_NOT_APPROVED',
      `The server authorization context does not approve ${SANDBOX_OFFLINE_EXECUTE_CAPABILITY}.`,
    )
  }
  if (input.authorization.runtimeMode !== 'APPROVED_EXECUTION') {
    return blocked(
      'SANDBOX_RUNTIME_MODE_BLOCKED',
      `${input.authorization.runtimeMode} cannot execute sandbox commands.`,
    )
  }
  if (input.authorization.deploymentMode !== 'local') {
    return blocked(
      'TRUSTED_LOCAL_CONTAINER_HOSTED_FORBIDDEN',
      'The bind-mounted compatibility container is forbidden in hosted deployment mode.',
    )
  }
  if (
    input.authorization.callerKind !== 'operator' &&
    input.authorization.callerKind !== 'system'
  ) {
    return blocked(
      'TRUSTED_LOCAL_CONTAINER_CALLER_FORBIDDEN',
      'The bind-mounted compatibility container is restricted to local operator or trusted system execution.',
    )
  }
  if (input.request.workspaceTrust !== 'trusted-local') {
    return blocked(
      'TRUSTED_LOCAL_CONTAINER_WORKSPACE_FORBIDDEN',
      'External or otherwise untrusted repositories require the strong copy-in container backend.',
    )
  }

  const profile = getSandboxCommandProfile(input.request.profileId)
  if (profile === undefined) {
    return blocked(
      'SANDBOX_COMMAND_PROFILE_NOT_FOUND',
      'The requested command profile is not installed.',
    )
  }

  let command: ParsedSandboxCommand
  try {
    command = parseSandboxCommand(input.request.command)
  } catch (error) {
    return blocked(
      'SANDBOX_COMMAND_INVALID',
      error instanceof Error ? error.message : String(error),
    )
  }
  if (!profile.allowedBinaries.includes(command.binary)) {
    return blocked(
      'SANDBOX_COMMAND_BINARY_NOT_ALLOWED',
      `Sandbox command binary is not allowed by ${profile.id}: ${command.binary}`,
    )
  }

  const grantCommands = input.authorization.grantAllowedCommands
  if (grantCommands !== undefined && !grantCommands.includes(command.rendered)) {
    return blocked(
      'SANDBOX_COMMAND_NOT_GRANTED',
      `The exact command is not present in the server-derived grant allowlist: ${command.rendered}`,
    )
  }

  // This trusted-local compatibility path is governed by its server-owned command profile.
  // Generic strong-sandbox defaults must not silently override that profile; callers, missions,
  // and grants may still tighten the profile limits through minimum-only intersection.
  const timeoutMs = minimumPositive([
    profile.timeoutMs,
    input.authorization.grantLimits?.timeoutMs,
    input.authorization.missionLimits?.timeoutMs,
    input.request.timeoutMs,
  ])
  const maxOutputBytes = minimumPositive([
    profile.maxOutputBytes,
    input.authorization.grantLimits?.maxOutputBytes,
    input.authorization.missionLimits?.maxOutputBytes,
    input.request.maxOutputBytes,
  ])

  const material = {
    schemaVersion: SANDBOX_COMMAND_POLICY_SCHEMA_VERSION,
    policyId: profile.id,
    policyVersion: profile.version,
    executionClass: 'trusted-local-container-compatibility' as const,
    deploymentMode: 'local' as const,
    callerKind: input.authorization.callerKind,
    capabilityId: SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
    command,
    image: profile.image,
    imageReference: 'operator-controlled-mutable-compatibility' as const,
    workspace: {
      mode: 'trusted-local-bind' as const,
      rootHash: sha256(input.request.workspaceRoot),
      trust: 'trusted-local' as const,
    },
    network: { mode: 'disabled' as const },
    limits: { timeoutMs, maxOutputBytes },
    controls: {
      shell: false as const,
      readWriteRepositoryBind: true as const,
      hostFallback: false as const,
      dependencyAcquisition: false as const,
      egress: false as const,
    },
  }
  const policy: EffectiveSandboxCommandPolicy = Object.freeze({
    ...material,
    fingerprint: sha256(stableJson(material)),
    resolvedAt: (input.now ?? (() => new Date()))().toISOString(),
  })
  return {
    allowed: true,
    reasonCode: 'SANDBOX_COMMAND_POLICY_ALLOWED',
    reason: `Resolved ${profile.id}@${profile.version} for trusted local compatibility execution.`,
    policy,
  }
}

function profile(
  id: SandboxCommandProfileId,
  image: string,
  allowedBinaries: readonly string[],
): SandboxCommandProfile {
  return Object.freeze({
    id,
    version: SANDBOX_COMMAND_POLICY_VERSION,
    image,
    allowedBinaries: Object.freeze([...allowedBinaries]),
    timeoutMs: TRUSTED_LOCAL_COMMAND_TIMEOUT_MS,
    maxOutputBytes: TRUSTED_LOCAL_COMMAND_MAX_OUTPUT_BYTES,
  })
}

function minimumPositive(values: readonly (number | undefined)[]): number {
  const candidates = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value) && value > 0,
  )
  return Math.max(1, Math.floor(Math.min(...candidates)))
}

function blocked(reasonCode: string, reason: string): SandboxCommandPolicyDecision {
  return { allowed: false, reasonCode, reason }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
