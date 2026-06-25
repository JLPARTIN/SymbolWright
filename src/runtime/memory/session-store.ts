import type { RuntimeSession } from '../session/runtime-session.js'

export class RuntimeSessionStore {
  private readonly sessions = new Map<string, RuntimeSession>()

  save(session: RuntimeSession): void {
    this.sessions.set(session.id, session)
  }

  get(id: string): RuntimeSession | undefined {
    return this.sessions.get(id)
  }

  list(): readonly RuntimeSession[] {
    return [...this.sessions.values()]
  }
}
