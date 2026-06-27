import type { RuntimeApproval } from '../types.js'

/** A single audit event recording an action, its outcome, and timestamp. */
export interface RuntimeAuditEvent {
  readonly action: string
  readonly status: 'allowed' | 'blocked'
  readonly ticketId?: string
  readonly detail: string
  readonly timestamp: string
}

/** In-memory append-only audit log for runtime actions. */
export class RuntimeAuditLog {
  private readonly events: RuntimeAuditEvent[] = []

  record(event: RuntimeAuditEvent): void {
    this.events.push(event)
  }

  list(): readonly RuntimeAuditEvent[] {
    return [...this.events]
  }
}

/** Creates an audit event with auto-generated timestamp and optional ticket ID. */
export function createAuditEvent(input: {
  readonly action: string
  readonly status: 'allowed' | 'blocked'
  readonly approval?: RuntimeApproval
  readonly detail: string
}): RuntimeAuditEvent {
  const timestamp = new Date().toISOString()

  const event: RuntimeAuditEvent = {
    action: input.action,
    status: input.status,
    detail: input.detail,
    timestamp,
  }

  if (input.approval !== undefined) {
    return {
      ...event,
      ticketId: input.approval.ticketId,
    }
  }

  return event
}

/** Renders audit events as a human-readable log string. */
export function renderAuditEvents(events: readonly RuntimeAuditEvent[]): string {
  return [
    'Runtime audit log',
    '',
    ...(events.length > 0
      ? events.map((event) => `- [${event.timestamp}] ${event.status.toUpperCase()} ${event.action}: ${event.detail}`)
      : ['- No audit events recorded.']),
  ].join('\n')
}
