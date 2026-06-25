import type { WriteIntent } from './write-intent.js'
import type { WriteIntentValidationResult } from './write-intent-validator.js'

export interface WriteApprovalTicket {
  readonly ticketId: string
  readonly intentId: string
  readonly target: string
  readonly targetPath: string
  readonly validationPassed: boolean
  readonly status: 'PENDING' | 'BLOCKED'
  readonly blockReason?: string
}

export function createWriteApprovalTicket(
  intent: WriteIntent,
  validation: WriteIntentValidationResult,
): WriteApprovalTicket {
  if (!validation.valid) {
    return {
      ticketId: `WRITE-TICKET-${intent.id}`,
      intentId: intent.id,
      target: intent.target,
      targetPath: intent.targetPath,
      validationPassed: false,
      status: 'BLOCKED',
      blockReason: validation.errors.join('; '),
    }
  }

  return {
    ticketId: `WRITE-TICKET-${intent.id}`,
    intentId: intent.id,
    target: intent.target,
    targetPath: intent.targetPath,
    validationPassed: true,
    status: 'PENDING',
  }
}

export function renderWriteApprovalTicket(ticket: WriteApprovalTicket): string {
  const sections: string[] = [
    'CodeMind write approval ticket',
    '',
    `Ticket ID: ${ticket.ticketId}`,
    `Intent ID: ${ticket.intentId}`,
    `Target: ${ticket.target}`,
    `Path: ${ticket.targetPath}`,
    `Validation: ${ticket.validationPassed ? 'PASSED' : 'FAILED'}`,
    `Status: ${ticket.status}`,
  ]

  if (ticket.blockReason !== undefined) {
    sections.push(`Block reason: ${ticket.blockReason}`)
  }

  if (ticket.status === 'PENDING') {
    sections.push(
      '',
      'This ticket is pending operator approval.',
      'No write action will be taken until the operator approves.',
    )
  }

  if (ticket.status === 'BLOCKED') {
    sections.push(
      '',
      'This ticket is blocked due to validation failure.',
      'The write intent must be corrected before approval can proceed.',
    )
  }

  return sections.join('\n')
}
