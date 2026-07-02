import { randomBytes } from 'node:crypto'

/**
 * Every checkpoint/session id minted here is real — timestamp + random bytes,
 * never a placeholder like "default" or "test-session". A caller-supplied
 * `RuntimeToolContext.sessionId` is preferred when present; this is the
 * fallback for contexts that don't carry one (one-shot CLI invocations,
 * fixtures) so checkpointing never silently no-ops for lack of a session id.
 */
export function generateCheckpointSessionId(): string {
  return `cm-${Date.now()}-${randomBytes(4).toString('hex')}`
}

export function generateCheckpointId(): string {
  return `ckpt-${Date.now()}-${randomBytes(4).toString('hex')}`
}

/** Prefers a caller-supplied session id; mints a real one when none was provided. */
export function resolveCheckpointSessionId(sessionId: string | undefined): string {
  return sessionId ?? generateCheckpointSessionId()
}
