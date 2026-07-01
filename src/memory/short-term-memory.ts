export interface SessionMessage {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
}

export class ShortTermMemory {
  private readonly messages: SessionMessage[] = []
  private tokenEstimate = 0

  constructor(private readonly maxContextTokens = 128000) {}

  public addMessage(message: SessionMessage): void {
    this.messages.push(message)
    this.tokenEstimate += this.estimateTokens(message.content)
  }

  public getMessages(): readonly SessionMessage[] {
    return [...this.messages]
  }

  public getTokenCount(): number {
    return this.tokenEstimate
  }

  public needsConsolidation(): boolean {
    return this.tokenEstimate > this.maxContextTokens * 0.7
  }

  public extractOldestMessages(count: number): readonly SessionMessage[] {
    const extracted = this.messages.splice(0, count)
    this.tokenEstimate = this.messages.reduce((sum, message) => {
      return sum + this.estimateTokens(message.content)
    }, 0)
    return extracted
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }
}
