import type { CodemindToolName, RuntimeToolDefinition } from '../types.js'

export class RuntimeRegistry {
  private readonly entries = new Map<CodemindToolName, RuntimeToolDefinition>()

  add(entry: RuntimeToolDefinition): void {
    if (this.entries.has(entry.name)) {
      throw new Error(`Runtime entry already exists: ${entry.name}`)
    }

    this.entries.set(entry.name, entry)
  }

  get(name: CodemindToolName): RuntimeToolDefinition | undefined {
    return this.entries.get(name)
  }

  getOrThrow(name: CodemindToolName): RuntimeToolDefinition {
    const entry = this.entries.get(name)

    if (entry === undefined) {
      throw new Error(`Runtime entry is missing: ${name}`)
    }

    return entry
  }

  has(name: CodemindToolName): boolean {
    return this.entries.has(name)
  }

  list(): readonly RuntimeToolDefinition[] {
    return [...this.entries.values()]
  }
}

export function createRuntimeRegistry(
  entries: readonly RuntimeToolDefinition[] = [],
): RuntimeRegistry {
  const registry = new RuntimeRegistry()

  for (const entry of entries) {
    registry.add(entry)
  }

  return registry
}
