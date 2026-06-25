import type { PrCollaborationClient } from './pr-collaboration.js'

export type FakePrCollaborationOperation =
  | {
      readonly type: 'addComment'
      readonly repository: string
      readonly prNumber: number
      readonly body: string
    }
  | {
      readonly type: 'addLabel'
      readonly repository: string
      readonly prNumber: number
      readonly label: string
    }

export class FakePrCollaborationClient implements PrCollaborationClient {
  readonly operations: FakePrCollaborationOperation[] = []

  async addComment(input: {
    readonly repository: string
    readonly prNumber: number
    readonly body: string
  }): Promise<void> {
    this.operations.push({
      type: 'addComment',
      repository: input.repository,
      prNumber: input.prNumber,
      body: input.body,
    })
  }

  async addLabel(input: {
    readonly repository: string
    readonly prNumber: number
    readonly label: string
  }): Promise<void> {
    this.operations.push({
      type: 'addLabel',
      repository: input.repository,
      prNumber: input.prNumber,
      label: input.label,
    })
  }
}
