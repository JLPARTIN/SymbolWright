import { describe, expect, it } from 'vitest'

import {
  createRuntimeReportSurfaceRegistry,
  renderRuntimeReportSurfaceRegistryJson,
  renderRuntimeReportSurfaceRegistryMarkdown,
} from './runtime-report-surface-registry.js'

const TS = '2026-01-01T00:00:00.000Z'

describe('runtime report surface registry', () => {
  it('creates a registry with all known surfaces', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    expect(registry.entryCount).toBe(13)
    expect(registry.entries).toHaveLength(13)
  })

  it('has no duplicate names', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })
    const names = registry.entries.map((entry) => entry.name)
    const unique = new Set(names)

    expect(unique.size).toBe(names.length)
  })

  it('includes all expected surface names', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })
    const names = registry.entries.map((entry) => entry.name)

    expect(names).toContain('zflow-report')
    expect(names).toContain('zflow-report-catalog')
    expect(names).toContain('zflow-report-suite')
    expect(names).toContain('zflow-report-rollup')
    expect(names).toContain('runtime-report-index')
    expect(names).toContain('runtime-report-note')
    expect(names).toContain('runtime-report-bundle-manifest')
    expect(names).toContain('runtime-report-collection')
    expect(names).toContain('runtime-report-hub')
    expect(names).toContain('cli-runtime-report-index')
    expect(names).toContain('cli-runtime-report-note')
    expect(names).toContain('cli-runtime-report-collection')
    expect(names).toContain('cli-runtime-report-hub')
  })

  it('all entries have readOnly safety flag', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    for (const entry of registry.entries) {
      expect(entry.safetyFlags.readOnly).toBe(true)
    }
  })

  it('all entries have noExecution safety flag', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    for (const entry of registry.entries) {
      expect(entry.safetyFlags.noExecution).toBe(true)
    }
  })

  it('all entries have noNetwork safety flag', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    for (const entry of registry.entries) {
      expect(entry.safetyFlags.noNetwork).toBe(true)
    }
  })

  it('all entries have noFileWrite safety flag', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    for (const entry of registry.entries) {
      expect(entry.safetyFlags.noFileWrite).toBe(true)
    }
  })

  it('all entries support at least one format', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    for (const entry of registry.entries) {
      expect(entry.formats.length).toBeGreaterThan(0)
    }
  })

  it('all entries have a valid kind', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })
    const validKinds = new Set(['model', 'renderer', 'tool', 'cli'])

    for (const entry of registry.entries) {
      expect(validKinds.has(entry.kind)).toBe(true)
    }
  })

  it('all entries have a non-empty module path', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    for (const entry of registry.entries) {
      expect(entry.module.length).toBeGreaterThan(0)
      expect(entry.module).toMatch(/\.ts$/)
    }
  })

  it('renders markdown output', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })
    const output = renderRuntimeReportSurfaceRegistryMarkdown(registry)

    expect(output).toContain('# Runtime Report Surface Registry')
    expect(output).toContain('Surfaces: 13')
    expect(output).toContain('zflow-report (model)')
    expect(output).toContain('cli-runtime-report-hub (cli)')
    expect(output).toContain('All surfaces are read-only.')
    expect(output).toContain('No execution is performed.')
    expect(output).toContain('No network access.')
    expect(output).toContain('No file writes.')
  })

  it('renders json output', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })
    const parsed = JSON.parse(renderRuntimeReportSurfaceRegistryJson(registry)) as {
      readonly entryCount: number
      readonly entries: readonly { readonly name: string }[]
    }

    expect(parsed.entryCount).toBe(13)
    expect(parsed.entries).toHaveLength(13)
  })

  it('uses provided generatedAt timestamp', () => {
    const registry = createRuntimeReportSurfaceRegistry({ generatedAt: TS })

    expect(registry.generatedAt).toBe(TS)
  })

  it('defaults generatedAt when not provided', () => {
    const registry = createRuntimeReportSurfaceRegistry()

    expect(registry.generatedAt).toBeTruthy()
    expect(typeof registry.generatedAt).toBe('string')
  })
})
