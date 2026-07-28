import { describe, expect, it } from 'vitest'

import {
  canAccessMission,
  resolveMissionVisibility,
  type TeamVisibilitySource,
} from './mission-access-guard.js'

function team(id: string, missionId: string): { id: string; missionId: string } {
  return { id, missionId }
}

function member(grantId: string, status = 'ready'): { grantId: string; status: string } {
  return { grantId, status }
}

describe('resolveMissionVisibility', () => {
  it('grants operator (undefined grantId) no team-derived visibility set (unused — operator is unrestricted elsewhere)', () => {
    const visibility = resolveMissionVisibility(undefined, undefined)
    expect(visibility.directlyOwnedGrantId).toBeUndefined()
    expect(visibility.teamAccessibleMissionIds.size).toBe(0)
  })

  it('resolves team visibility per mission id, not by unioning grant ids', () => {
    const source: TeamVisibilitySource = {
      listTeams: () => [team('team-1', 'mission-a1')],
      membersByTeam: (teamId) => (teamId === 'team-1' ? [member('grant-c')] : []),
    }
    const visibility = resolveMissionVisibility('grant-c', source)
    expect(visibility.teamAccessibleMissionIds.has('mission-a1')).toBe(true)
    expect(visibility.teamAccessibleMissionIds.has('mission-a2')).toBe(false)
  })

  it('excludes removed members from visibility', () => {
    const source: TeamVisibilitySource = {
      listTeams: () => [team('team-1', 'mission-a1')],
      membersByTeam: () => [member('grant-c', 'removed')],
    }
    const visibility = resolveMissionVisibility('grant-c', source)
    expect(visibility.teamAccessibleMissionIds.has('mission-a1')).toBe(false)
  })

  it('is a no-op without a team source', () => {
    const visibility = resolveMissionVisibility('grant-c', undefined)
    expect(visibility.teamAccessibleMissionIds.size).toBe(0)
  })
})

describe('canAccessMission', () => {
  it('treats an undefined visibility.directlyOwnedGrantId as the operator, always allowed', () => {
    const visibility = resolveMissionVisibility(undefined, undefined)
    const result = canAccessMission({ id: 'm1', grantId: 'grant-a' }, visibility, 'destructive')
    expect(result).toEqual({ relationship: 'operator', allowed: true })
  })

  it('grants the owning grant full authority', () => {
    const visibility = resolveMissionVisibility('grant-a', undefined)
    const result = canAccessMission({ id: 'm1', grantId: 'grant-a' }, visibility, 'destructive')
    expect(result).toEqual({ relationship: 'mission_owner', allowed: true })
  })

  it('denies an unrelated grant with relationship none', () => {
    const visibility = resolveMissionVisibility('grant-b', undefined)
    const result = canAccessMission({ id: 'm1', grantId: 'grant-a' }, visibility, 'read')
    expect(result).toEqual({ relationship: 'none', allowed: false })
  })

  it('denies a mission with no grantId to any delegated caller (fail closed)', () => {
    const visibility = resolveMissionVisibility('grant-a', undefined)
    const result = canAccessMission({ id: 'm1', grantId: undefined }, visibility, 'read')
    expect(result).toEqual({ relationship: 'none', allowed: false })
  })

  it('grants an active team member read/contribute/execute but not manage/destructive', () => {
    const source: TeamVisibilitySource = {
      listTeams: () => [team('team-1', 'mission-a1')],
      membersByTeam: () => [member('grant-c')],
    }
    const visibility = resolveMissionVisibility('grant-c', source)
    const mission = { id: 'mission-a1', grantId: 'grant-a' }
    expect(canAccessMission(mission, visibility, 'read')).toEqual({
      relationship: 'team_member',
      allowed: true,
    })
    expect(canAccessMission(mission, visibility, 'contribute')).toEqual({
      relationship: 'team_member',
      allowed: true,
    })
    expect(canAccessMission(mission, visibility, 'execute')).toEqual({
      relationship: 'team_member',
      allowed: true,
    })
    expect(canAccessMission(mission, visibility, 'manage').allowed).toBe(false)
    expect(canAccessMission(mission, visibility, 'destructive').allowed).toBe(false)
  })

  it('does not leak visibility into an unrelated sibling mission owned by the same grant', () => {
    const source: TeamVisibilitySource = {
      listTeams: () => [team('team-1', 'mission-a1')],
      membersByTeam: () => [member('grant-c')],
    }
    const visibility = resolveMissionVisibility('grant-c', source)
    const sibling = { id: 'mission-a2', grantId: 'grant-a' }
    expect(canAccessMission(sibling, visibility, 'read')).toEqual({
      relationship: 'none',
      allowed: false,
    })
  })
})
