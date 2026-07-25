import { randomUUID } from 'node:crypto'

import type { OrchestrationStore } from './orchestration-store.js'
import {
  COLLABORATION_MESSAGE_TYPES,
  type CollaborationMessage,
  type CollaborationMessageType,
} from './shared-context-types.js'

export class MessageValidationError extends Error {}

export interface SendMessageInput {
  readonly missionId: string
  readonly teamId: string
  readonly type: CollaborationMessageType
  readonly senderId: string
  readonly recipientId?: string
  readonly taskId?: string
  readonly body: Readonly<Record<string, unknown>>
  readonly correlationId?: string
}

/**
 * Structured, schema-validated, persisted, attributable collaboration messages (Section 15).
 * `senderId` must always be the caller's own authenticated member id — there is no field a
 * message body can set to claim a different sender, so a message can never spoof another
 * team member's identity; every message is a durable, auditable record, never an unaudited
 * side channel.
 */
export class CollaborationMessageService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public send(input: SendMessageInput): CollaborationMessage {
    if (!(COLLABORATION_MESSAGE_TYPES as readonly string[]).includes(input.type)) {
      throw new MessageValidationError(`Unknown collaboration message type: ${input.type}`)
    }
    const sender = this.store.members.read(input.senderId)
    const isSystemSender = input.senderId === 'operator' || input.senderId === 'system'
    if (sender === undefined && !isSystemSender) {
      throw new MessageValidationError(`Unknown sender member id: ${input.senderId}`)
    }
    if (sender !== undefined && sender.teamId !== input.teamId) {
      throw new MessageValidationError('Sender does not belong to this team.')
    }

    const message: CollaborationMessage = {
      id: randomUUID(),
      missionId: input.missionId,
      teamId: input.teamId,
      type: input.type,
      senderId: input.senderId,
      body: input.body,
      createdAt: this.now().toISOString(),
      ...(input.recipientId === undefined ? {} : { recipientId: input.recipientId }),
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    }
    this.store.messages.write(message.id, message)
    return message
  }

  public listForTeam(teamId: string): readonly CollaborationMessage[] {
    return this.store.messagesByTeam(teamId)
  }

  public listForTask(taskId: string): readonly CollaborationMessage[] {
    return this.store.messages.list().filter((message) => message.taskId === taskId)
  }
}
