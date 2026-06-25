export class RuntimeRegistry {
  private readonly entries = new Map<string, unknown>()

  add(name: string, entry: unknown): void {
    if (this.entries.has(name)) {
      throw new Error(`Runtime entry already exists: ${name}`)
    }

    this.entries.set(name, entry)
  }

  get(name: string): unknown {
    return this.entries.get(name)
  }

  list(): readonly unknown[] {
    return [...this.entries.values()]
  }
}
