import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import type { AccessRuntime } from '../access/access-runtime.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import type { SandboxCommandWorkspaceTrust } from '../sandbox/sandbox-command-policy.js'
import type { SandboxAuthorizationContext } from '../sandbox/sandbox-policy-model.js'

export interface MissionSandboxCommandAuthority {
  readonly authorization: SandboxAuthorizationContext
  readonly workspaceTrust: SandboxCommandWorkspaceTrust
}

export function resolveMissionSandboxCommandAuthority(input: {
  readonly mission: SymbolWrightMission
  readonly accessRuntime?: AccessRuntime
  readonly env?: NodeJS.ProcessEnv
}): MissionSandboxCommandAuthority {
  const deploymentMode =
    input.env?.['SYMBOLWRIGHT_DEPLOYMENT_MODE']?.trim().toLowerCase() === 'hosted'
      ? 'hosted'
      : 'local'
  const base = {
    deploymentMode,
    runtimeMode: input.mission.agent.runtimeMode,
    repositoryId: input.mission.repository.rootPath,
    workspaceId: input.mission.id,
    missionId: input.mission.id,
    intent: 'offline-execution' as const,
  }

  if (input.mission.grantId === undefined) {
    return {
      workspaceTrust: 'trusted-local',
      authorization: {
        ...base,
        callerKind: 'system',
        approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
      },
    }
  }

  const grant = input.accessRuntime?.grantService.getGrant(input.mission.grantId)
  return {
    workspaceTrust: 'external-untrusted',
    authorization: {
      ...base,
      callerKind: 'delegated-grant',
      approvedCapabilityIds: grant?.symbolWrightCapabilities ?? [],
      grantId: input.mission.grantId,
      ...(grant === undefined
        ? {}
        : {
            grantVersion: grant.version,
            principalId: grant.principalId,
            grantAllowedCommands: grant.executionLimits.allowedCommands ?? [],
            grantPolicyReferences: grant.sandboxPolicyReferences,
          }),
    },
  }
}
