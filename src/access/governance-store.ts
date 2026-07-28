import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

const SCHEMA_VERSION = 1
const DEFAULT_RESERVATION_TTL_MS = 5 * 60 * 1000

export class GovernanceStoreError extends Error {}

/** Canonical location for the governance store under a given workspace root. */
export function resolveGovernanceStorePath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), '.symbolwright', 'governance', 'governance.db')
}

export type ReservationStatus = 'open' | 'settled' | 'released'

export interface ReserveUsageOptions {
  /** Scopes idempotency-key (`requestId`) uniqueness -- typically `grant:<grantId>` or
   * `operator`. Never trust a caller to supply a scope that collides with another grant's. */
  readonly grantScope: string
  /** Optional client-supplied idempotency key. Unique only within `grantScope`
   * (`UNIQUE(grant_scope, request_id)`), never globally -- a client can't reuse or predict
   * another grant's key to interfere with its reservations. Retrying the same `requestId`
   * returns the original reservation unchanged rather than creating a duplicate charge. */
  readonly requestId?: string
  readonly missionId?: string
  readonly grantId?: string
  readonly reservedMicrodollars: bigint
  readonly ttlMs?: number
}

export interface ReservationRecord {
  /** Always server-generated -- never trusted from the caller. */
  readonly reservationId: string
  readonly status: ReservationStatus
  readonly reservedMicrodollars: bigint
}

export interface MissionUsageTotals {
  readonly totalMicrodollars: bigint
}

export interface RateLimitConsumeResult {
  readonly allowed: boolean
  readonly count: bigint
}

function accountingDayFor(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Durable, transactional governance store: rate-limit windows, per-mission usage, per-grant daily
 * totals, and the usage-reservation ledger -- one SQLite file (`node:sqlite`, WAL mode, matching
 * the precedent in `src/memory/storage/database.ts`) so a read-modify-write against any of these
 * is a real transaction under concurrent writers, unlike atomic-replace-a-whole-JSON-file.
 * Concurrency limits (active provider requests/SSE streams/autonomous executions) deliberately do
 * NOT live here -- see `provider-concurrency-guard.ts` -- since that state is inherently
 * process-local and doesn't need to survive a restart, unlike money and durable rate limits.
 */
export class GovernanceStore {
  readonly #db: DatabaseSync
  readonly #now: () => Date
  readonly #reserveStmt: StatementSync
  readonly #findByRequestIdStmt: StatementSync
  readonly #getReservationStmt: StatementSync
  readonly #settleReservationStmt: StatementSync
  readonly #releaseReservationStmt: StatementSync
  readonly #expiredOpenReservationsStmt: StatementSync
  readonly #upsertMissionUsageStmt: StatementSync
  readonly #getMissionUsageStmt: StatementSync
  readonly #upsertGrantDailyUsageStmt: StatementSync
  readonly #getGrantDailyUsageStmt: StatementSync
  readonly #upsertRateLimitStmt: StatementSync
  readonly #getRateLimitStmt: StatementSync

  public constructor(dbPath: string, now: () => Date = () => new Date()) {
    this.#now = now
    const dir = dirname(dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })

    const isNewFile = !existsSync(dbPath)
    try {
      // `readBigInts: true` makes every INTEGER column read back as `bigint` uniformly, so a
      // large accumulated total is never silently truncated or misread through a JS `number`.
      this.#db = new DatabaseSync(dbPath, { readBigInts: true })
    } catch (error) {
      throw new GovernanceStoreError(
        `Governance store at ${dbPath} could not be opened: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (isNewFile && existsSync(dbPath)) chmodSync(dbPath, 0o600)

    this.#db.exec('PRAGMA journal_mode = WAL')
    this.#initializeSchema()

    this.#reserveStmt = this.#db.prepare(`
      INSERT INTO usage_reservations
        (reservation_id, request_id, grant_scope, mission_id, grant_id, accounting_day,
         reserved_microdollars, actual_microdollars, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'open', ?, ?)
    `)
    this.#findByRequestIdStmt = this.#db.prepare(`
      SELECT reservation_id, status, reserved_microdollars FROM usage_reservations
      WHERE grant_scope = ? AND request_id = ?
    `)
    this.#getReservationStmt = this.#db.prepare(`
      SELECT reservation_id, status, reserved_microdollars, mission_id, grant_id, accounting_day
      FROM usage_reservations WHERE reservation_id = ?
    `)
    this.#settleReservationStmt = this.#db.prepare(`
      UPDATE usage_reservations SET status = 'settled', actual_microdollars = ?
      WHERE reservation_id = ? AND status = 'open'
    `)
    this.#releaseReservationStmt = this.#db.prepare(`
      UPDATE usage_reservations SET status = 'released' WHERE reservation_id = ? AND status = 'open'
    `)
    this.#expiredOpenReservationsStmt = this.#db.prepare(`
      SELECT reservation_id, reserved_microdollars, mission_id, grant_id, accounting_day
      FROM usage_reservations WHERE status = 'open' AND expires_at < ?
    `)
    this.#upsertMissionUsageStmt = this.#db.prepare(`
      INSERT INTO mission_usage (mission_id, total_microdollars, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(mission_id) DO UPDATE SET
        total_microdollars = total_microdollars + excluded.total_microdollars,
        updated_at = excluded.updated_at
    `)
    this.#getMissionUsageStmt = this.#db.prepare(`
      SELECT total_microdollars FROM mission_usage WHERE mission_id = ?
    `)
    this.#upsertGrantDailyUsageStmt = this.#db.prepare(`
      INSERT INTO grant_daily_usage (grant_id, accounting_day, total_microdollars, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(grant_id, accounting_day) DO UPDATE SET
        total_microdollars = total_microdollars + excluded.total_microdollars,
        updated_at = excluded.updated_at
    `)
    this.#getGrantDailyUsageStmt = this.#db.prepare(`
      SELECT total_microdollars FROM grant_daily_usage WHERE grant_id = ? AND accounting_day = ?
    `)
    this.#upsertRateLimitStmt = this.#db.prepare(`
      INSERT INTO rate_limit_windows (key, window_start_ms, count)
      VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN rate_limit_windows.window_start_ms = excluded.window_start_ms
                      THEN rate_limit_windows.count + 1 ELSE 1 END,
        window_start_ms = excluded.window_start_ms
    `)
    this.#getRateLimitStmt = this.#db.prepare(
      'SELECT window_start_ms, count FROM rate_limit_windows WHERE key = ?',
    )
  }

  #initializeSchema(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rate_limit_windows (
        key TEXT PRIMARY KEY,
        window_start_ms INTEGER NOT NULL,
        count INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mission_usage (
        mission_id TEXT PRIMARY KEY,
        total_microdollars INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS grant_daily_usage (
        grant_id TEXT NOT NULL,
        accounting_day TEXT NOT NULL,
        total_microdollars INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (grant_id, accounting_day)
      );

      CREATE TABLE IF NOT EXISTS usage_reservations (
        reservation_id TEXT PRIMARY KEY,
        request_id TEXT,
        grant_scope TEXT NOT NULL,
        mission_id TEXT,
        grant_id TEXT,
        accounting_day TEXT NOT NULL,
        reserved_microdollars INTEGER NOT NULL,
        actual_microdollars INTEGER,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        UNIQUE (grant_scope, request_id)
      );

      CREATE INDEX IF NOT EXISTS idx_reservations_open_expiry
        ON usage_reservations (status, expires_at);
    `)

    const existing = this.#db.prepare('SELECT version FROM schema_meta WHERE id = 1').get() as
      { version: bigint } | undefined
    if (existing === undefined) {
      this.#db.prepare('INSERT INTO schema_meta (id, version) VALUES (1, ?)').run(SCHEMA_VERSION)
    } else if (Number(existing.version) !== SCHEMA_VERSION) {
      // Only one schema version has ever existed; a mismatch here means a future version wrote
      // this file and this build can't safely interpret it -- fail closed rather than guess.
      throw new GovernanceStoreError(
        `Governance store schema version ${existing.version} is not supported by this build ` +
          `(expected ${SCHEMA_VERSION}).`,
      )
    }
  }

  /**
   * Atomically reserves `reservedMicrodollars` against the given mission/grant/day scope. Idempotent
   * on `(grantScope, requestId)` when `requestId` is supplied: a retried request returns the
   * original reservation instead of reserving twice.
   */
  public reserveUsage(options: ReserveUsageOptions): ReservationRecord {
    if (options.requestId !== undefined) {
      const existing = this.#findByRequestIdStmt.get(options.grantScope, options.requestId) as
        | { reservation_id: string; status: string; reserved_microdollars: number | bigint }
        | undefined
      if (existing !== undefined) {
        return {
          reservationId: existing.reservation_id,
          status: existing.status as ReservationStatus,
          reservedMicrodollars: BigInt(existing.reserved_microdollars),
        }
      }
    }

    const reservationId = randomUUID()
    const now = this.#now()
    const ttlMs = options.ttlMs ?? DEFAULT_RESERVATION_TTL_MS
    const expiresAt = new Date(now.getTime() + ttlMs)

    this.#reserveStmt.run(
      reservationId,
      options.requestId ?? null,
      options.grantScope,
      options.missionId ?? null,
      options.grantId ?? null,
      accountingDayFor(now),
      options.reservedMicrodollars,
      now.toISOString(),
      expiresAt.toISOString(),
    )

    return { reservationId, status: 'open', reservedMicrodollars: options.reservedMicrodollars }
  }

  /**
   * Reconciles an open reservation against actual usage. `actualMicrodollars` omitted means the
   * provider never reported usage for this call -- settles conservatively at the full reserved
   * amount rather than assuming zero cost. The settled amount (not the original reservation) is
   * what lands in `mission_usage`/`grant_daily_usage`, so any unused portion of an over-estimate
   * is simply never counted. A no-op if the reservation is already settled/released (idempotent
   * retries of a settle call never double-count).
   */
  public settleReservation(reservationId: string, actualMicrodollars?: bigint): void {
    const reservation = this.#getReservationStmt.get(reservationId) as
      | {
          reservation_id: string
          status: string
          reserved_microdollars: number | bigint
          mission_id: string | null
          grant_id: string | null
          accounting_day: string
        }
      | undefined
    if (reservation === undefined || reservation.status !== 'open') return

    const settledAmount = actualMicrodollars ?? BigInt(reservation.reserved_microdollars)
    const now = this.#now().toISOString()

    this.#settleReservationStmt.run(settledAmount, reservationId)
    if (reservation.mission_id !== null) {
      this.#upsertMissionUsageStmt.run(reservation.mission_id, settledAmount, now)
    }
    if (reservation.grant_id !== null) {
      this.#upsertGrantDailyUsageStmt.run(
        reservation.grant_id,
        reservation.accounting_day,
        settledAmount,
        now,
      )
    }
  }

  /** Releases a reservation with no usage impact -- for a call that was reserved but never
   * actually made (e.g. rejected before the provider call started). */
  public releaseReservation(reservationId: string): void {
    this.#releaseReservationStmt.run(reservationId)
  }

  /**
   * Settles every reservation still `open` past its `expires_at`, conservatively, at its full
   * reserved amount. Call once at startup: an `open` reservation surviving to this point implies
   * the process crashed mid-call, and settling it at full reservation (rather than releasing it
   * as zero-cost) prevents a crash from either permanently locking budget or undercounting spend.
   */
  public settleExpiredReservations(): { readonly settledCount: number } {
    const nowIso = this.#now().toISOString()
    const expired = this.#expiredOpenReservationsStmt.all(nowIso) as {
      reservation_id: string
      reserved_microdollars: number | bigint
    }[]
    for (const row of expired) {
      this.settleReservation(row.reservation_id, BigInt(row.reserved_microdollars))
    }
    return { settledCount: expired.length }
  }

  public getMissionUsage(missionId: string): MissionUsageTotals {
    const row = this.#getMissionUsageStmt.get(missionId) as
      { total_microdollars: bigint } | undefined
    return { totalMicrodollars: row === undefined ? 0n : row.total_microdollars }
  }

  public getGrantDailyUsageMicrodollars(grantId: string, accountingDay?: string): bigint {
    const day = accountingDay ?? accountingDayFor(this.#now())
    const row = this.#getGrantDailyUsageStmt.get(grantId, day) as
      { total_microdollars: number | bigint } | undefined
    return row === undefined ? 0n : BigInt(row.total_microdollars)
  }

  /** Atomically increments a durable rate-limit counter for `key` within its current fixed
   * window (`windowStartMs`, e.g. `Math.floor(Date.now() / windowMs) * windowMs`), resetting the
   * count whenever the window rolls over. Returns whether this increment stayed within `limit`. */
  public consumeRateLimitWindow(
    key: string,
    windowStartMs: number,
    limit: number,
  ): RateLimitConsumeResult {
    this.#upsertRateLimitStmt.run(key, windowStartMs)
    const row = this.#getRateLimitStmt.get(key) as { window_start_ms: bigint; count: bigint }
    return { allowed: row.count <= limit, count: row.count }
  }

  public accountingDay(): string {
    return accountingDayFor(this.#now())
  }

  public close(): void {
    this.#db.close()
  }
}
