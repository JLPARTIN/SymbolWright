import { describe, expect, it } from 'vitest'

import { checkTeamAccess } from './team-access-guard.js'

const team = { id: 'team-1', missionId: 'mission-1', ownerGrantId: 'grant-owner' }

describe('checkTeamAccess', () => {
  it('allows the operator (undefined grantId) everything', () => {
    const result = checkTeamAccess(
      team,
      { isMissionOwner: false, isActiveMember: false },
      'destructive',
    )
    expect(result).toEqual({ relationship: 'operator', allowed: true })
  })

  it('allows the mission owner full authority even without team ownership', () => {
    const result = checkTeamAccess(
      team,
      { grantId: 'grant-mission-owner', isMissionOwner: true, isActiveMember: false },
      'destructive',
    )
    expect(result).toEqual({ relationship: 'mission_owner', allowed: true })
  })

  it('allows the team owner to manage but not destructive mission-level actions unless also mission owner', () => {
    const caller = { grantId: 'grant-owner', isMissionOwner: false, isActiveMember: false }
    expect(checkTeamAccess(team, caller, 'manage')).toEqual({
      relationship: 'team_owner',
      allowed: true,
    })
    expect(checkTeamAccess(team, caller, 'destructive').allowed).toBe(false)
  })

  it('allows an active member read/contribute/execute but not manage/destructive', () => {
    const caller = { grantId: 'grant-member', isMissionOwner: false, isActiveMember: true }
    expect(checkTeamAccess(team, caller, 'read')).toEqual({
      relationship: 'team_member',
      allowed: true,
    })
    expect(checkTeamAccess(team, caller, 'execute').allowed).toBe(true)
    expect(checkTeamAccess(team, caller, 'manage').allowed).toBe(false)
  })

  it('denies an unrelated grant with relationship none (404 semantics)', () => {
    const caller = { grantId: 'grant-stranger', isMissionOwner: false, isActiveMember: false }
    expect(checkTeamAccess(team, caller, 'read')).toEqual({ relationship: 'none', allowed: false })
  })

  it('denies a removed member (isActiveMember: false) even if formerly a member', () => {
    const caller = { grantId: 'grant-former-member', isMissionOwner: false, isActiveMember: false }
    expect(checkTeamAccess(team, caller, 'read').allowed).toBe(false)
  })
})
