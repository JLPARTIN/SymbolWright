import { SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY } from '../access/sandbox-capabilities.js'
import type {
  SandboxApprovalBinding,
  SandboxAuthorizationContext,
  SandboxCallerKind,
  SandboxDeploymentMode,
  SandboxPolicyReference,
} from './sandbox-policy-model.js'
import { readPolicyVersion } from './policy-version.js'

export interface DependencyAuthorizationInput {
  readonly policyReference: SandboxPolicyReference
  readonly deploymentMode: SandboxDeploymentMode
  readonly callerKind: SandboxCallerKind
  readonly runtimeMode: SandboxAuthorizationContext['runtimeMode']
  readonly repositoryId: string
  readonly workspaceId: string
  readonly missionId?: string
  readonly principalId?: string
  readonly grantId?: string
  readonly grantVersion?: number
  readonly capabilityApproved: boolean
  readonly operatorApproved?: boolean
  readonly env?: NodeJS.ProcessEnv
}

export interface DependencyAuthorizationReceipt {
  readonly approvalId?: string
  readonly grantVersion: number
}

export function buildDependencyAuthorization(
  input: DependencyAuthorizationInput,
): SandboxAuthorizationContext {
  const expectedPolicyVersions = dependencyPolicyVersions({
    policyReference: input.policyReference,
    ...(input.grantId === undefined ? {} : { grantId: input.grantId }),
    ...(input.grantVersion === undefined ? {} : { grantVersion: input.grantVersion }),
    ...(input.missionId === undefined ? {} : { missionId: input.missionId }),
    ...(input.env === undefined ? {} : { env: input.env }),
  })
  const approval =
    input.operatorApproved === true
      ? operatorApproval(input.policyReference, expectedPolicyVersions)
      : undefined

  return {
    deploymentMode: input.deploymentMode,
    callerKind: input.callerKind,
    runtimeMode: input.runtimeMode,
    approvedCapabilityIds: input.capabilityApproved
      ? [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY]
      : [],
    repositoryId: input.repositoryId,
    workspaceId: input.workspaceId,
    ...(input.missionId === undefined ? {} : { missionId: input.missionId }),
    ...(input.principalId === undefined ? {} : { principalId: input.principalId }),
    ...(input.grantId === undefined ? {} : { grantId: input.grantId }),
    ...(input.grantVersion === undefined ? {} : { grantVersion: input.grantVersion }),
    policyReference: input.policyReference,
    expectedPolicyVersions,
    ...(approval === undefined ? {} : { approval }),
    intent: 'dependency-acquisition',
  }
}

export function bindDependencyApproval(
  authorization: SandboxAuthorizationContext,
  receipt: DependencyAuthorizationReceipt,
): SandboxAuthorizationContext {
  const policyVersions = authorization.expectedPolicyVersions
  if (policyVersions === undefined || receipt.approvalId === undefined) return authorization
  return {
    ...authorization,
    approval: {
      id: receipt.approvalId,
      capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      ...(authorization.grantVersion === undefined
        ? {}
        : { grantVersion: authorization.grantVersion }),
      policyVersions,
    },
  }
}

export function dependencyAuthorizationMetadata(
  authorization: SandboxAuthorizationContext,
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    ...(authorization.missionId === undefined ? {} : { missionId: authorization.missionId }),
    sandboxPolicyVersions: authorization.expectedPolicyVersions ?? {},
  }
}

export function dependencyPolicyVersions(input: {
  readonly policyReference: SandboxPolicyReference
  readonly grantId?: string
  readonly grantVersion?: number
  readonly missionId?: string
  readonly env?: NodeJS.ProcessEnv
}): Readonly<Record<string, number>> {
  const env = input.env ?? process.env
  const globalVersion = readPolicyVersion(env['SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION'], 1)
    .value
  return Object.freeze({
    'dependency-global': globalVersion,
    [input.policyReference.id]: input.policyReference.version,
    ...(input.grantId === undefined
      ? {}
      : { [`grant:${input.grantId}`]: input.grantVersion ?? 1 }),
    ...(input.missionId === undefined ? {} : { [`mission:${input.missionId}`]: 1 }),
    'dependency-request-tightening': 1,
  })
}

function operatorApproval(
  policyReference: SandboxPolicyReference,
  policyVersions: Readonly<Record<string, number>>,
): SandboxApprovalBinding {
  return {
    id: `operator:${policyReference.id}@${policyReference.version}`,
    capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
    policyVersions,
  }
}
