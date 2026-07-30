import { findLiveAccessRuntimeForGrant } from '../../access/access-runtime.js'
import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
} from '../../access/sandbox-capabilities.js'
import {
  grantAllowsDependencyAcquisition,
  grantAllowsEgress,
  resolveGrantSandboxPolicyReferences,
} from '../../access/sandbox-policy-compat.js'
import {
  operationCapabilitiesForTool,
  resolveToolPermissionDescriptor,
} from '../../access/tool-permission-catalog.js'
import { detectGitHubRepository } from '../../app/api/repository-routes.js'
import {
  bindDependencyApproval,
  buildDependencyAuthorization,
  dependencyAuthorizationMetadata,
} from '../../sandbox/dependency-acquisition-authority.js'
import {
  bindEgressApproval,
  buildEgressAuthorization,
  egressAuthorizationMetadata,
} from '../../sandbox/egress-authorization.js'
import { getOrCreateApplicationSandboxNetworkRuntime } from '../../sandbox/sandbox-network-runtime.js'
import type {
  RuntimeToolContext,
  RuntimeToolDefinition,
  ToolAuthorizationReceipt,
} from '../types.js'

/**
 * The single chokepoint every production tool-execution path (`agent-loop.ts`'s LLM-driven tool
 * calls, and the MCP server's `call()`) must route through. When `context.accessControl` is
 * present (an agent-token-authenticated caller), this performs a real per-operation authorization
 * check before the tool runs — fail closed on any tool without a permission descriptor. When
 * `context.accessControl` is absent (the legacy local operator), the tool runs under operator-owned
 * policy and any capability-specific server-derived authority.
 */
export async function runAuthorizedTool<TInput>(
  tool: RuntimeToolDefinition<TInput>,
  input: TInput,
  context: RuntimeToolContext,
): Promise<string> {
  const networkRuntime = getOrCreateApplicationSandboxNetworkRuntime({ workspaceRoot: context.cwd })
  let effectiveContext: RuntimeToolContext = {
    ...context,
    sandboxNetworkRuntime: context.sandboxNetworkRuntime ?? networkRuntime,
  }
  const accessControl = effectiveContext.accessControl
  const accessRuntimeForGrant =
    accessControl === undefined
      ? undefined
      : findLiveAccessRuntimeForGrant(accessControl.principalId, accessControl.grantId)

  if (
    tool.name === 'dependency_acquire' &&
    effectiveContext.sandboxDependencyAuthorization === undefined
  ) {
    if (
      accessControl === undefined &&
      networkRuntime.defaultDependencyPolicyReference !== undefined
    ) {
      effectiveContext = {
        ...effectiveContext,
        sandboxDependencyAuthorization: buildDependencyAuthorization({
          policyReference: networkRuntime.defaultDependencyPolicyReference,
          deploymentMode: context.sandboxAuthorization?.deploymentMode ?? deploymentMode(),
          callerKind: 'operator',
          runtimeMode: context.policy.mode,
          repositoryId: context.cwd,
          workspaceId: context.sessionId ?? context.cwd,
          ...(context.sessionId === undefined ? {} : { missionId: context.sessionId }),
          capabilityApproved: true,
          operatorApproved: true,
        }),
      }
    } else if (accessControl !== undefined && accessRuntimeForGrant !== undefined) {
      const grant = accessRuntimeForGrant.grantService.getGrant(accessControl.grantId)
      if (grant !== undefined) {
        const reference = resolveGrantSandboxPolicyReferences(grant).references.dependency
        if (reference !== undefined) {
          effectiveContext = {
            ...effectiveContext,
            sandboxDependencyAuthorization: buildDependencyAuthorization({
              policyReference: reference,
              deploymentMode: context.sandboxAuthorization?.deploymentMode ?? deploymentMode(),
              callerKind: 'delegated-grant',
              runtimeMode: context.policy.mode,
              repositoryId: (await detectGitHubRepository(context.cwd)) ?? context.cwd,
              workspaceId: context.sessionId ?? context.cwd,
              ...(context.sessionId === undefined ? {} : { missionId: context.sessionId }),
              principalId: grant.principalId,
              grantId: grant.id,
              grantVersion: grant.version,
              capabilityApproved: grantAllowsDependencyAcquisition(grant),
            }),
          }
        }
      }
    }
  }

  if (
    tool.name === 'sandbox_egress_request' &&
    effectiveContext.sandboxEgressAuthorization === undefined
  ) {
    if (accessControl === undefined && networkRuntime.defaultEgressPolicyReference !== undefined) {
      effectiveContext = {
        ...effectiveContext,
        sandboxEgressAuthorization: buildEgressAuthorization({
          policyReference: networkRuntime.defaultEgressPolicyReference,
          deploymentMode: context.sandboxAuthorization?.deploymentMode ?? deploymentMode(),
          callerKind: 'operator',
          runtimeMode: context.policy.mode,
          repositoryId: context.cwd,
          workspaceId: context.sessionId ?? context.cwd,
          ...(context.sessionId === undefined ? {} : { missionId: context.sessionId }),
          capabilityApproved: true,
          operatorApproved: true,
        }),
      }
    } else if (accessControl !== undefined && accessRuntimeForGrant !== undefined) {
      const grant = accessRuntimeForGrant.grantService.getGrant(accessControl.grantId)
      if (grant !== undefined) {
        const reference = resolveGrantSandboxPolicyReferences(grant).references.egress
        if (reference !== undefined) {
          effectiveContext = {
            ...effectiveContext,
            sandboxEgressAuthorization: buildEgressAuthorization({
              policyReference: reference,
              deploymentMode: context.sandboxAuthorization?.deploymentMode ?? deploymentMode(),
              callerKind: 'delegated-grant',
              runtimeMode: context.policy.mode,
              repositoryId: (await detectGitHubRepository(context.cwd)) ?? context.cwd,
              workspaceId: context.sessionId ?? context.cwd,
              ...(context.sessionId === undefined ? {} : { missionId: context.sessionId }),
              principalId: grant.principalId,
              grantId: grant.id,
              grantVersion: grant.version,
              capabilityApproved: grantAllowsEgress(grant),
            }),
          }
        }
      }
    }
  }

  let dependencyReceipt: ToolAuthorizationReceipt | undefined
  let egressReceipt: ToolAuthorizationReceipt | undefined
  if (accessControl !== undefined) {
    const descriptor = resolveToolPermissionDescriptor(tool.name)
    if (descriptor === undefined) {
      throw new Error(
        `authorization_denied[UNKNOWN_TOOL]: Tool "${tool.name}" has no registered permission descriptor and is refused for an authorized agent.`,
      )
    }
    const callerMetadata =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : undefined
    const capabilities = [
      descriptor.capability,
      ...(descriptor.additionalCapabilities ?? []),
      ...operationCapabilitiesForTool(tool.name, callerMetadata),
    ]
    for (const capability of [...new Set(capabilities)]) {
      const metadata =
        capability === SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY &&
        effectiveContext.sandboxDependencyAuthorization !== undefined
          ? dependencyAuthorizationMetadata(
              effectiveContext.sandboxDependencyAuthorization,
              callerMetadata,
            )
          : capability === SANDBOX_EGRESS_CAPABILITY &&
              effectiveContext.sandboxEgressAuthorization !== undefined
            ? egressAuthorizationMetadata(
                effectiveContext.sandboxEgressAuthorization,
                callerMetadata,
              )
            : callerMetadata
      const dependencyRepository = effectiveContext.sandboxDependencyAuthorization?.repositoryId
      const egressRepository = effectiveContext.sandboxEgressAuthorization?.repositoryId
      const capabilityRepository =
        capability === SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY
          ? dependencyRepository
          : capability === SANDBOX_EGRESS_CAPABILITY
            ? egressRepository
            : undefined
      const receipt =
        (capability === SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY ||
          capability === SANDBOX_EGRESS_CAPABILITY) &&
        accessRuntimeForGrant !== undefined
          ? await accessRuntimeForGrant.authorizationService.requireAuthorized({
              principalId: accessControl.principalId,
              grantId: accessControl.grantId,
              ...(accessControl.sessionId === undefined
                ? {}
                : { sessionId: accessControl.sessionId }),
              capability,
              ...(capabilityRepository === undefined ? {} : { repository: capabilityRepository }),
              ...(context.sessionId === undefined ? {} : { missionId: context.sessionId }),
              toolName: tool.name,
              ...(metadata === undefined ? {} : { metadata }),
            })
          : await accessControl.requireAuthorized(capability, tool.name, metadata)
      if (capability === SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY && receipt !== undefined) {
        dependencyReceipt = receipt
      }
      if (capability === SANDBOX_EGRESS_CAPABILITY && receipt !== undefined) {
        egressReceipt = receipt
      }
    }
  }

  if (
    tool.name === 'dependency_acquire' &&
    effectiveContext.sandboxDependencyAuthorization !== undefined &&
    dependencyReceipt !== undefined
  ) {
    effectiveContext = {
      ...effectiveContext,
      sandboxDependencyAuthorization: bindDependencyApproval(
        effectiveContext.sandboxDependencyAuthorization,
        dependencyReceipt,
      ),
    }
  }
  if (
    tool.name === 'sandbox_egress_request' &&
    effectiveContext.sandboxEgressAuthorization !== undefined &&
    egressReceipt !== undefined
  ) {
    effectiveContext = {
      ...effectiveContext,
      sandboxEgressAuthorization: bindEgressApproval(
        effectiveContext.sandboxEgressAuthorization,
        egressReceipt,
      ),
    }
  }
  return tool.execute(input, effectiveContext)
}

function deploymentMode(): 'local' | 'hosted' {
  return process.env['SYMBOLWRIGHT_DEPLOYMENT_MODE']?.trim().toLowerCase() === 'hosted'
    ? 'hosted'
    : 'local'
}
