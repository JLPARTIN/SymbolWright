export interface ReadinessCheck {
  readonly ready: boolean
  readonly detail?: string
}

export interface ReadinessDetailSnapshot {
  readonly ready: boolean
  readonly checkedAt: string
  readonly checks: Readonly<Record<string, ReadinessCheck>>
}

export class ReadinessRegistry {
  readonly #checks = new Map<string, ReadinessCheck>([['process', { ready: true }]])

  public setCheck(name: string, ready: boolean, detail?: string): void {
    this.#checks.set(name, { ready, ...(detail === undefined ? {} : { detail }) })
  }

  public isReady(): boolean {
    return [...this.#checks.values()].every((check) => check.ready)
  }

  public publicSnapshot(): { readonly ready: boolean } {
    return { ready: this.isReady() }
  }

  public detailedSnapshot(): ReadinessDetailSnapshot {
    return {
      ready: this.isReady(),
      checkedAt: new Date().toISOString(),
      checks: Object.fromEntries(
        [...this.#checks.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
    }
  }
}
