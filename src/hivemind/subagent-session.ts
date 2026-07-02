import { randomBytes } from 'node:crypto'

/**
 * Every child session id is real — timestamp + random bytes, never a
 * placeholder. Prefixed `sub-` (as opposed to checkpointing's `cm-`) so a
 * checkpoint or audit entry produced by a subagent is visibly distinct from
 * one produced by the top-level conversation session.
 */
export function generateSubagentSessionId(): string {
  return `sub-${Date.now()}-${randomBytes(4).toString('hex')}`
}
