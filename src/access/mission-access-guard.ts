/**
 * Resolves *whether* a delegated caller may act on a specific mission, and *what kind* of
 * action they may take. Two things are deliberately kept separate rather than collapsed into a
 * single boolean:
 *
 * - **Visibility** (can the caller see this mission at all): direct ownership (`mission.grantId
 *   === callerGrantId`) plus per-mission team membership. Team membership is resolved per
 *   mission ID, never by unioning grant IDs — a team member on mission A1 must not become able
 *   to see grant A's other missions A2/A3 just because A1 and A2 share an owning grant.
 * - **Authority for the operation** (what the caller may do once they can see it): an active
 *   team member's visibility does not imply mission-management authority. `pause`/`delete`/
 *   `export`-tier operations stay reserved for the mission owner, the team owner, or the
 *   operator; a team member gets read/contribute-tier access only, further narrowed by their
 *   own capabilities/role/task assignment at the authorization layer (unchanged, checked
 *   separately via `AuthorizationService`).
 */

export type MissionAccessRelationship =
  | 'operator'
  | 'mission_owner'
  | 'team_owner'
  | 'team_member'
  | 'none'

export type MissionOperation = 'read' | 'contribute' | 'execute' | 'manage' | 'destructive'

export interface MissionVisibility {
  /** The caller's own grant id, when the caller is a delegated agent (undefined = operator). */
  readonly directlyOwnedGrantId?: string
  /** Mission ids the caller can see via an active team membership — never a grant-id union. */
  readonly teamAccessibleMissionIds: ReadonlySet<string>
  /** Team ids the caller owns (created), granting management authority over their mission. */
  readonly ownedTeamMissionIds: ReadonlySet<string>
}

/** Minimal, structural view of a mission this guard needs — avoids importing the full
 * `SymbolWrightMission` type into `access/`, which has no other dependency on `mission/`. */
export interface MissionOwnershipFields {
  readonly id: string
  readonly grantId?: string | undefined
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

/** Structural view of the orchestration store this guard needs to resolve team-based
 * visibility — avoids a hard dependency from `access/` onto the concrete `orchestration/`
 * module; `mission-routes.ts` wires in the real `OrchestrationStore`. */
export interface TeamVisibilitySource {
  listTeams(): readonly { readonly id: string; readonly missionId: string }[]
  membersByTeam(teamId: string): readonly { readonly grantId: string; readonly status: string }[]
}

/**
 * Computes what a caller's grant can see, once, so every mission-linked route (list, direct
 * access, sandbox, checkpoints, autonomy, `/api/agent`) shares one definition instead of
 * re-deriving "owner grant plus active team-member grants" independently and risking drift.
 */
export function resolveMissionVisibility(
  callerGrantId: string | undefined,
  teamSource: TeamVisibilitySource | undefined,
): MissionVisibility {
  const teamAccessibleMissionIds = new Set<string>()
  const ownedTeamMissionIds = new Set<string>()
  if (callerGrantId !== undefined && teamSource !== undefined) {
    for (const team of teamSource.listTeams()) {
      const isActiveMember = teamSource
        .membersByTeam(team.id)
        .some((member) => member.grantId === callerGrantId && member.status !== 'removed')
      if (isActiveMember) teamAccessibleMissionIds.add(team.missionId)
    }
  }
  return {
    ...(callerGrantId === undefined ? {} : { directlyOwnedGrantId: callerGrantId }),
    teamAccessibleMissionIds,
    ownedTeamMissionIds,
  }
}

function relationshipFor(
  mission: MissionOwnershipFields,
  visibility: MissionVisibility,
): MissionAccessRelationship {
  if (visibility.directlyOwnedGrantId === undefined) return 'operator'
  if (mission.grantId === visibility.directlyOwnedGrantId) return 'mission_owner'
  if (visibility.ownedTeamMissionIds.has(mission.id)) return 'team_owner'
  if (visibility.teamAccessibleMissionIds.has(mission.id)) return 'team_member'
  return 'none'
}

/**
 * Returns the caller's relationship to `mission` and whether that relationship authorizes the
 * requested `operation`. Callers should treat `allowed: false` uniformly as `404` when the
 * relationship is `'none'` (non-enumeration: indistinguishable from "never existed") and `403`
 * when the relationship is anything else (the caller can already see the mission, so denial
 * doesn't need to hide its existence).
 */
export function canAccessMission(
  mission: MissionOwnershipFields,
  visibility: MissionVisibility,
  operation: MissionOperation,
): { readonly relationship: MissionAccessRelationship; readonly allowed: boolean } {
  const relationship = relationshipFor(mission, visibility)
  return { relationship, allowed: OPERATION_ALLOWED_RELATIONSHIPS[operation].has(relationship) }
}
