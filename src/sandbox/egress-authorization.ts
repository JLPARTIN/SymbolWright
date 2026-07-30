import { createHash } from 'node:crypto'

import { SANDBOX_EGRESS_CAPABILITY } from '../access/sandbox-capabilities.js'
import { readPolicyVersion } from './policy-version.js'
import type {
  SandboxApprovalBinding,
  SandboxAuthorizationContext,
  SandboxCallerKind,
  SandboxDeploymentMode,
  SandboxPolicyReference,
} from './sandbox-policy-model.js'

export interface EgressAuthorizationInput {
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

export interface EgressAuthorizationReceipt {
  readonly approvalId?: string
  readonly grantVersion: number
}

export function buildEgressAuthorization(input: EgressAuthorizationInput): SandboxAuthorizationContext {
  const expectedPolicyVersions = egressPolicyVersions({
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
    approvedCapabilityIds: input.capabilityApproved ? [SANDBOX_EGRESS_CAPABILITY] : [],
    repositoryId: input.repositoryId,
    workspaceId: input.workspaceId,
    ...(input.missionId === undefined ? {} : { missionId: input.missionId }),
    ...(input.principalId === undefined ? {} : { principalId: input.principalId }),
    ...(input.grantId === undefined ? {} : { grantId: input.grantId }),
    ...(input.grantVersion === undefined ? {} : { grantVersion: input.grantVersion }),
    policyReference: input.policyReference,
    expectedPolicyVersions,
    ...(approval === undefined ? {} : { approval }),
    intent: 'egress-execution',
  }
}

export function bindEgressApproval(
  authorization: SandboxAuthorizationContext,
  receipt: EgressAuthorizationReceipt,
): SandboxAuthorizationContext {
  const policyVersions = authorization.expectedPolicyVersions
  if (policyVersions === undefined || receipt.approvalId === undefined) return authorization
  return {
    ...authorization,
    approval: {
      id: receipt.approvalId,
      capabilityId: SANDBOX_EGRESS_CAPABILITY,
      ...(authorization.grantVersion === undefined
        ? {}
        : { grantVersion: authorization.grantVersion }),
      policyVersions,
    },
  }
}

export function egressAuthorizationMetadata(
  authorization: SandboxAuthorizationContext,
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const rawUrl = typeof metadata?.['url'] === 'string' ? metadata['url'] : ''
  let hostname = 'invalid'
  let pathHash = sha256(rawUrl)
  try {
    const url = new URL(rawUrl)
    hostname = url.hostname
    pathHash = sha256(`${url.pathname}${url.search}`)
  } catch {
    // Invalid URLs remain redacted and are rejected by the broker.
  }
  return {
    destinationHostname: hostname,
    destinationPathHash: pathHash,
    method: typeof metadata?.['method'] === 'string' ? metadata['method'].toUpperCase() : 'GET',
    ...(authorization.missionId === undefined ? {} : { missionId: authorization.missionId }),
    sandboxPolicyVersions: authorization.expectedPolicyVersions ?? {},
  }
}

export function egressPolicyVersions(input: {
  readonly policyReference: SandboxPolicyReference
  readonly grantId?: string
  readonly grantVersion?: number
  readonly missionId?: string
  readonly env?: NodeJS.ProcessEnv
}): Readonly<Record<string, number>> {
  const env = input.env ?? process.env
  const globalVersion = readPolicyVersion(env['SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION'], 1).value
  return Object.freeze({
    'egress-global': globalVersion,
    [input.policyReference.id]: input.policyReference.version,
    ...(input.grantId === undefined ? {} : { [`grant:${input.grantId}`]: input.grantVersion ?? 1 }),
    ...(input.missionId === undefined ? {} : { [`mission:${input.missionId}`]: 1 }),
    'egress-request-tightening': 1,
  })
}

function operatorApproval(
  policyReference: SandboxPolicyReference,
  policyVersions: Readonly<Record<string, number>>,
): SandboxApprovalBinding {
  return {
    id: `operator:${policyReference.id}@${policyReference.version}`,
    capabilityId: SANDBOX_EGRESS_CAPABILITY,
    policyVersions,
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
