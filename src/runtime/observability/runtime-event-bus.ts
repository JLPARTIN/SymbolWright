export type RuntimeEventCategory =
  | 'tool_execution'
  | 'policy_check'
  | 'approval_gate'
  | 'audit_record'
  | 'session_lifecycle'
  | 'health_check'

export interface RuntimeEvent {
  readonly category: RuntimeEventCategory
  readonly action: string
  readonly timestamp: string
  readonly detail: string
  readonly metadata?: Record<string, unknown>
}

type EventCallback = (event: RuntimeEvent) => void

export class RuntimeEventBus {
  private readonly events: RuntimeEvent[] = []
  private readonly subscribers = new Map<RuntimeEventCategory, Set<EventCallback>>()

  emit(event: RuntimeEvent): void {
    this.events.push(event)

    const callbacks = this.subscribers.get(event.category)
    if (callbacks !== undefined) {
      for (const cb of callbacks) {
        cb(event)
      }
    }
  }

  subscribe(category: RuntimeEventCategory, callback: EventCallback): void {
    let callbacks = this.subscribers.get(category)
    if (callbacks === undefined) {
      callbacks = new Set()
      this.subscribers.set(category, callbacks)
    }
    callbacks.add(callback)
  }

  unsubscribe(category: RuntimeEventCategory, callback: EventCallback): void {
    const callbacks = this.subscribers.get(category)
    if (callbacks !== undefined) {
      callbacks.delete(callback)
    }
  }

  getEvents(category?: RuntimeEventCategory): readonly RuntimeEvent[] {
    if (category === undefined) {
      return [...this.events]
    }
    return this.events.filter((e) => e.category === category)
  }

  clear(): void {
    this.events.length = 0
  }
}

export function createRuntimeEventBus(): RuntimeEventBus {
  return new RuntimeEventBus()
}
