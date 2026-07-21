import { describe, expect, it } from 'vitest'

import { renderSandboxCommand } from './cli-sandbox.js'
import { runnerAvailability } from './sandbox/sandbox-registry.js'
import type { SandboxContainerEngineStatus } from './sandbox/sandbox-images.js'
import type { SandboxImageDefinition } from './sandbox/sandbox-types.js'

const CHECKED_AT = '2026-07-20T00:00:00.000Z'
const OPTIONS = {
  now: () => new Date('2026-07-21T00:00:00.000Z'),
  discoverCommandAvailability: async () =>
    new Map([
      [
        'docker',
        runnerAvailability('available', CHECKED_AT, {
          version: '27.0.0',
        }),
      ],
    ]),
  inspectLocalImage: async (
    image: SandboxImageDefinition,
    engine: SandboxContainerEngineStatus,
  ) => ({
    imageId: image.id,
    image: image.image,
    engine: engine.engine,
    status: 'missing' as const,
    inspectedAt: CHECKED_AT,
    reason: 'allowlisted image was not found in the local image store.',
  }),
}

describe('sandbox CLI renderer', () => {
  it('renders sandbox doctor diagnostics by default', async () => {
    const rendered = await renderSandboxCommand(['doctor'], OPTIONS)

    expect(rendered).toContain('CodeMind Sandbox Doctor')
    expect(rendered).toContain('Mode: READ-ONLY')
    expect(rendered).toContain('Execution enabled: false')
  })

  it('renders sandbox image policy diagnostics', async () => {
    const rendered = await renderSandboxCommand(['images'], OPTIONS)

    expect(rendered).toContain('CodeMind Sandbox Images')
    expect(rendered).toContain('does not pull images automatically')
  })

  it('renders sandbox image inspection for allowlisted IDs only', async () => {
    const rendered = await renderSandboxCommand(
      ['inspect', 'node-22-bookworm-slim'],
      OPTIONS,
    )

    expect(rendered).toContain('CodeMind Sandbox Image Inspection')
    expect(rendered).toContain('Image ID: node-22-bookworm-slim')
    expect(rendered).toContain('Container engine: docker (available)')
    expect(rendered).toContain('Local store status: missing')
    expect(rendered).toContain('does not acquire, run, or mutate images')
  })

  it('rejects raw image names in sandbox image inspection', async () => {
    const rendered = await renderSandboxCommand(
      ['inspect', 'node:22-bookworm-slim'],
      OPTIONS,
    )

    expect(rendered).toContain('Unknown sandbox image id')
    expect(rendered).toContain('arbitrary container image names')
  })

  it('keeps unsupported sandbox subcommands inactive', async () => {
    const rendered = await renderSandboxCommand(['run', 'example.py'], OPTIONS)

    expect(rendered).toContain('not active')
    expect(rendered).toContain('sandbox run example.py')
  })
})
