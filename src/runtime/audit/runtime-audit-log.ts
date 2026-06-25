import type { RuntimeApproval } from '../types.js'

export interface RuntimeAuditEvent {
  readonly action: string
  readonly status: 'allowed' | 'blocked'
  readonly ticketId?: string
  readonly detail: string
}

export class RuntimeAuditLog {
  private readonly events: RuntimeAuditEvent[] = []

  record(event: RuntimeAuditEvent): void {
    this.events.push(event)
  }

  list(): readonly RuntimeAuditEvent[] {
    return [...this.events]
  }
}

export function createAuditEvent(input: {
  readonly action: string
  readonly status: 'allowed' | 'blocked'
  readonly approval?: RuntimeApproval
  readonly detail: string
}): RuntimeAuditEvent {
  return {
    action: input.action,
    status: input.status,
    ticketId: input.approval?.ticketId,
    detail: input.detail,
  }
}

export function renderAuditEvents(events: readonly RuntimeAuditEvent[]): string {
  return [
    'Runtime audit log',
    '',
    ...(events.length > 0
      ? events.map((event) => `- ${event.status.toUpperCase()} ${event.action}: ${event.detail}`)
      : ['- No audit events recorded.']),
  ].join('\n')
}
