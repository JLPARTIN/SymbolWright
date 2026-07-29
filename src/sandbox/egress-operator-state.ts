import fs from 'node:fs'
import path from 'node:path'

import {
  EgressPolicyCatalog,
  describeEgressRuntimeState,
  type EgressPolicyProfile,
  type EgressRuntimeState,
} from './egress-policy.js'

export interface EgressOperatorProfileSummary {
  readonly id: string
  readonly version: number
  readonly enabled: boolean
  readonly emergencyDisabled: boolean
}

export interface EgressOperatorState {
  readonly state: EgressRuntimeState
  readonly configured: boolean
  readonly brokerSupported: boolean
  readonly globallyDisabled: boolean
  readonly policyFileConfigured: boolean
  readonly profileCount: number
  readonly profiles: readonly EgressOperatorProfileSummary[]
  readonly detail: string
  readonly errorCode?: string
  readonly catalog: EgressPolicyCatalog
}

export function loadEgressOperatorState(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): EgressOperatorState {
  const globallyDisabled = env['SYMBOLWRIGHT_DISABLE_SANDBOX_EGRESS'] === 'true'
  const configuredPath = env['SYMBOLWRIGHT_EGRESS_POLICY_FILE']?.trim()
  const policyFileConfigured = configuredPath !== undefined && configuredPath.length > 0

  if (globallyDisabled) {
    return Object.freeze({
      state: 'disabled',
      configured: false,
      brokerSupported: true,
      globallyDisabled: true,
      policyFileConfigured,
      profileCount: 0,
      profiles: Object.freeze([]),
      detail: 'Brokered egress is emergency-disabled; strong sandbox execution remains offline.',
      catalog: new EgressPolicyCatalog(),
    })
  }

  if (!policyFileConfigured) {
    return Object.freeze({
      state: 'dependency-only',
      configured: false,
      brokerSupported: true,
      globallyDisabled: false,
      policyFileConfigured: false,
      profileCount: 0,
      profiles: Object.freeze([]),
      detail:
        'No operator egress policy file is configured; dependency acquisition may be brokered, but runtime execution remains offline.',
      catalog: new EgressPolicyCatalog(),
    })
  }

  const filePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(cwd, configuredPath)
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return deniedState({
      policyFileConfigured: true,
      detail: `Egress policy file could not be read or parsed: ${errorMessage(error)}`,
      errorCode: 'EGRESS_POLICY_FILE_INVALID',
    })
  }

  if (!Array.isArray(parsed)) {
    return deniedState({
      policyFileConfigured: true,
      detail: 'Egress policy file must contain a JSON array of operator-owned profiles.',
      errorCode: 'EGRESS_POLICY_FILE_SCHEMA_INVALID',
    })
  }

  let catalog: EgressPolicyCatalog
  try {
    catalog = new EgressPolicyCatalog(parsed as EgressPolicyProfile[])
  } catch (error) {
    return deniedState({
      policyFileConfigured: true,
      detail: `Egress policy profile validation failed: ${errorMessage(error)}`,
      errorCode: 'EGRESS_POLICY_PROFILE_INVALID',
    })
  }

  const profiles = Object.freeze(
    catalog.listLatest().map((profile) =>
      Object.freeze({
        id: profile.id,
        version: profile.version,
        enabled: profile.enabled,
        emergencyDisabled: profile.emergencyDisabled === true,
      }),
    ),
  )
  const enabledCount = profiles.filter(
    (profile) => profile.enabled && !profile.emergencyDisabled,
  ).length
  const state = describeEgressRuntimeState({
    globallyDisabled: false,
    profileCount: enabledCount,
    brokerSupported: true,
  })

  return Object.freeze({
    state,
    configured: enabledCount > 0,
    brokerSupported: true,
    globallyDisabled: false,
    policyFileConfigured: true,
    profileCount: profiles.length,
    profiles,
    detail:
      enabledCount > 0
        ? `${enabledCount} operator-owned allowlisted egress profile${enabledCount === 1 ? '' : 's'} available; direct sandbox networking remains disabled.`
        : 'The egress policy file contains no enabled profile; runtime execution remains offline.',
    catalog,
  })
}

function deniedState(input: {
  readonly policyFileConfigured: boolean
  readonly detail: string
  readonly errorCode: string
}): EgressOperatorState {
  return Object.freeze({
    state: 'denied',
    configured: false,
    brokerSupported: true,
    globallyDisabled: false,
    policyFileConfigured: input.policyFileConfigured,
    profileCount: 0,
    profiles: Object.freeze([]),
    detail: input.detail,
    errorCode: input.errorCode,
    catalog: new EgressPolicyCatalog(),
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
