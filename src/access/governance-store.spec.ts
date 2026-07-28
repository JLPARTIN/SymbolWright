import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GovernanceStore, GovernanceStoreError } from './governance-store.js'

describe('GovernanceStore', () => {
  let dir: string
  let dbPath: string
  let store: GovernanceStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'symbolwright-governance-store-'))
    dbPath = join(dir, 'governance.db')
    store = new GovernanceStore(dbPath)
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates the database file with restrictive permissions', () => {
    const mode = statSync(dbPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('reserves usage and settles it at the actual reported amount', () => {
    const reservation = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 1000n,
    })
    expect(reservation.status).toBe('open')

    store.settleReservation(reservation.reservationId, 400n)

    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(400n)
    expect(store.getGrantDailyUsageMicrodollars('g1')).toBe(400n)
  })

  it('settles conservatively at the full reservation when no actual amount is reported', () => {
    const reservation = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 750n,
    })

    store.settleReservation(reservation.reservationId)

    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(750n)
    expect(store.getGrantDailyUsageMicrodollars('g1')).toBe(750n)
  })

  it('accumulates usage across multiple settled reservations for the same mission and grant', () => {
    const r1 = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 100n,
    })
    store.settleReservation(r1.reservationId, 100n)
    const r2 = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 250n,
    })
    store.settleReservation(r2.reservationId, 250n)

    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(350n)
    expect(store.getGrantDailyUsageMicrodollars('g1')).toBe(350n)
  })

  it('is idempotent on (grantScope, requestId): a retried reservation returns the original', () => {
    const first = store.reserveUsage({
      grantScope: 'grant:g1',
      requestId: 'req-1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 500n,
    })
    const retried = store.reserveUsage({
      grantScope: 'grant:g1',
      requestId: 'req-1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 999n,
    })

    expect(retried.reservationId).toBe(first.reservationId)
    expect(retried.reservedMicrodollars).toBe(500n)

    store.settleReservation(first.reservationId, 500n)
    // Settling twice (once per "retry") must not double-count.
    store.settleReservation(retried.reservationId, 500n)
    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(500n)
  })

  it('does not let the same requestId collide across different grant scopes', () => {
    const forGrantA = store.reserveUsage({
      grantScope: 'grant:a',
      requestId: 'shared-id',
      reservedMicrodollars: 10n,
    })
    const forGrantB = store.reserveUsage({
      grantScope: 'grant:b',
      requestId: 'shared-id',
      reservedMicrodollars: 20n,
    })
    expect(forGrantA.reservationId).not.toBe(forGrantB.reservationId)
  })

  it('releases a reservation with no usage impact', () => {
    const reservation = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 1000n,
    })
    store.releaseReservation(reservation.reservationId)
    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(0n)
    // A released reservation is no longer open, so settling it afterward is a no-op.
    store.settleReservation(reservation.reservationId, 999n)
    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(0n)
  })

  it('settles a reservation past its expiry at the full reserved amount, conservatively', () => {
    let now = new Date('2026-01-01T00:00:00.000Z')
    const expiringStore = new GovernanceStore(join(dir, 'expiring.db'), () => now)
    const reservation = expiringStore.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 600n,
      ttlMs: 1000,
    })

    now = new Date(now.getTime() + 2000)
    const result = expiringStore.settleExpiredReservations()

    expect(result.settledCount).toBe(1)
    expect(expiringStore.getMissionUsage('m1').totalMicrodollars).toBe(600n)

    // Idempotent: running the sweep again finds nothing left to settle.
    const second = expiringStore.settleExpiredReservations()
    expect(second.settledCount).toBe(0)
    expect(expiringStore.getMissionUsage('m1').totalMicrodollars).toBe(600n)

    void reservation
    expiringStore.close()
  })

  it('does not settle a reservation that has not yet expired', () => {
    const reservation = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 600n,
      ttlMs: 60_000,
    })
    const result = store.settleExpiredReservations()
    expect(result.settledCount).toBe(0)
    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(0n)
    void reservation
  })

  it('handles a mission-usage total that exceeds Number.MAX_SAFE_INTEGER exactly', () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) * 1000n
    const reservation = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm-huge',
      reservedMicrodollars: huge,
    })
    store.settleReservation(reservation.reservationId, huge)
    expect(store.getMissionUsage('m-huge').totalMicrodollars).toBe(huge)
  })

  it('keeps per-mission and per-grant totals independent across missions/grants', () => {
    const r1 = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 100n,
    })
    store.settleReservation(r1.reservationId, 100n)
    const r2 = store.reserveUsage({
      grantScope: 'grant:g2',
      missionId: 'm2',
      grantId: 'g2',
      reservedMicrodollars: 200n,
    })
    store.settleReservation(r2.reservationId, 200n)

    expect(store.getMissionUsage('m1').totalMicrodollars).toBe(100n)
    expect(store.getMissionUsage('m2').totalMicrodollars).toBe(200n)
    expect(store.getGrantDailyUsageMicrodollars('g1')).toBe(100n)
    expect(store.getGrantDailyUsageMicrodollars('g2')).toBe(200n)
  })

  describe('consumeRateLimitWindow', () => {
    it('allows consumption up to the limit and rejects beyond it within the same window', () => {
      const windowStart = 1000
      expect(store.consumeRateLimitWindow('k', windowStart, 2)).toEqual({
        allowed: true,
        count: 1n,
      })
      expect(store.consumeRateLimitWindow('k', windowStart, 2)).toEqual({
        allowed: true,
        count: 2n,
      })
      expect(store.consumeRateLimitWindow('k', windowStart, 2)).toEqual({
        allowed: false,
        count: 3n,
      })
    })

    it('resets the count once the window rolls over', () => {
      expect(store.consumeRateLimitWindow('k', 1000, 1)).toEqual({ allowed: true, count: 1n })
      expect(store.consumeRateLimitWindow('k', 1000, 1)).toEqual({ allowed: false, count: 2n })
      expect(store.consumeRateLimitWindow('k', 2000, 1)).toEqual({ allowed: true, count: 1n })
    })
  })

  it('reopening the same database file preserves prior data', () => {
    const reservation = store.reserveUsage({
      grantScope: 'grant:g1',
      missionId: 'm1',
      grantId: 'g1',
      reservedMicrodollars: 300n,
    })
    store.settleReservation(reservation.reservationId, 300n)
    store.close()

    const reopened = new GovernanceStore(dbPath)
    expect(reopened.getMissionUsage('m1').totalMicrodollars).toBe(300n)
    reopened.close()
    store = new GovernanceStore(dbPath)
  })

  it('rejects opening a database with a future, unrecognized schema version', () => {
    store.close()
    const raw = new DatabaseSync(dbPath)
    raw.exec('UPDATE schema_meta SET version = 999 WHERE id = 1')
    raw.close()

    expect(() => new GovernanceStore(dbPath)).toThrow(GovernanceStoreError)
    store = new GovernanceStore(join(dir, 'fresh-after-failure.db'))
  })
})
