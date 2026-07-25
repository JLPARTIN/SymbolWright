import type { SymbolWrightToolName, RuntimeToolDefinition } from '../types.js'

/** Map-based registry of runtime tools with fail-fast getOrThrow. */
export class RuntimeRegistry {
  private readonly entries = new Map<SymbolWrightToolName, RuntimeToolDefinition>()

  add(entry: RuntimeToolDefinition): void {
    if (this.entries.has(entry.name)) {
      throw new Error(`Runtime entry already exists: ${entry.name}`)
    }

    this.entries.set(entry.name, entry)
  }

  get(name: SymbolWrightToolName): RuntimeToolDefinition | undefined {
    return this.entries.get(name)
  }

  getOrThrow(name: SymbolWrightToolName): RuntimeToolDefinition {
    const entry = this.entries.get(name)

    if (entry === undefined) {
      throw new Error(`Runtime entry is missing: ${name}`)
    }

    return entry
  }

  has(name: SymbolWrightToolName): boolean {
    return this.entries.has(name)
  }

  list(): readonly RuntimeToolDefinition[] {
    return [...this.entries.values()]
  }
}

/** Creates a RuntimeRegistry populated with the given tool definitions. */
export function createRuntimeRegistry(
  entries: readonly RuntimeToolDefinition[] = [],
): RuntimeRegistry {
  const registry = new RuntimeRegistry()

  for (const entry of entries) {
    registry.add(entry)
  }

  return registry
}
