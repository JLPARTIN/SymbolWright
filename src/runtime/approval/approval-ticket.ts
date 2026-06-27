import type { RuntimeApproval, RuntimeApprovalScope } from '../types.js'

export interface ApprovalTicket extends RuntimeApproval {
  readonly reason: string
  readonly createdAt: string
}

export function createApprovalTicket(input: {
  readonly ticketId: string
  readonly approvedBy: string
  readonly scopes: readonly RuntimeApprovalScope[]
  readonly reason: string
  readonly createdAt?: string
}): ApprovalTicket {
  if (input.ticketId.trim().length === 0) {
    throw new Error('Approval ticket id is required.')
  }

  if (input.approvedBy.trim().length === 0) {
    throw new Error('Approval approver is required.')
  }

  if (input.scopes.length === 0) {
    throw new Error('Approval ticket requires at least one scope.')
  }

  return {
    ticketId: input.ticketId.trim(),
    approvedBy: input.approvedBy.trim(),
    scopes: input.scopes,
    reason: input.reason.trim() || 'operator-approved execution gate',
    createdAt: input.createdAt ?? new Date(0).toISOString(),
  }
}

export function parseApprovalTicketId(args: readonly string[]): string | undefined {
  const index = args.indexOf('--approval-ticket')
  if (index === -1) {
    return undefined
  }

  return args[index + 1]
}
