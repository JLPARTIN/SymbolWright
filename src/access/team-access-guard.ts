/**
 * Sibling to `mission-access-guard.ts`'s `canAccessMission`, same relationship/operation
 * shape, applied to `AgentTeam` resources. `TeamService.listTeams()`/`getTeam()` previously had
 * no notion of caller identity at all — any capability holder could list, read, or mutate any
 * team. This guard makes team resource-instance ownership explicit rather than only checking
 * capability class (the same defect `mission-access-guard.ts` closes for missions).
 */

import type { MissionAccessRelationship, MissionOperation } from './mission-access-guard.js'

/** Minimal, structural view of a team this guard needs. */
export interface TeamOwnershipFields {
  readonly id: string
  readonly missionId: string
  readonly ownerGrantId?: string | undefined
}

export interface TeamAccessCaller {
  /** Undefined = operator (unrestricted). */
  readonly grantId?: string
  /** True when the mission this team belongs to is directly owned by the caller's grant. */
  readonly isMissionOwner: boolean
  /** True when the caller's grant is an active (non-removed) member of this team. */
  readonly isActiveMember: boolean
}

const OPERATION_ALLOWED_RELATIONSHIPS: Readonly<
  Record<MissionOperation, ReadonlySet<MissionAccessRelationship>>
> = {
  read: new Set(['operator', 'mission_owner', 'team_owner', 'team_member']),
  contribute: new Set(['operator', 'mission_owner', 'team_owner', 'team_member']),
  execute: new Set(['operator', 'mission_owner', 'team_owner', 'team_member']),
  manage: new Set(['operator', 'mission_owner', 'team_owner']),
  destructive: new Set(['operator', 'mission_owner']),
}

function relationshipFor(
  team: TeamOwnershipFields,
  caller: TeamAccessCaller,
): MissionAccessRelationship {
  if (caller.grantId === undefined) return 'operator'
  if (caller.isMissionOwner) return 'mission_owner'
  if (team.ownerGrantId === caller.grantId) return 'team_owner'
  if (caller.isActiveMember) return 'team_member'
  return 'none'
}

/**
 * Returns the caller's relationship to `team` and whether that relationship authorizes
 * `operation`. Same status-code contract as `canAccessMission`: `404` for relationship
 * `'none'` (non-enumeration), `403` for a visible-but-unauthorized operation.
 */
export function checkTeamAccess(
  team: TeamOwnershipFields,
  caller: TeamAccessCaller,
  operation: MissionOperation,
): { readonly relationship: MissionAccessRelationship; readonly allowed: boolean } {
  const relationship = relationshipFor(team, caller)
  return { relationship, allowed: OPERATION_ALLOWED_RELATIONSHIPS[operation].has(relationship) }
}
