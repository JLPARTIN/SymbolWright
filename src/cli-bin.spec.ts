import { describe, expect, it } from 'vitest'

import { renderCodemindBinCommand } from './cli-bin.js'
import { runnerAvailability } from './sandbox/sandbox-registry.js'

const CHECKED_AT = '2026-07-20T00:00:00.000Z'
const SANDBOX_OPTIONS = {
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
}

describe('codemind bin sandbox routing', () => {
  it('routes top-level sandbox doctor through the sandbox renderer', async () => {
    const rendered = await renderCodemindBinCommand(['sandbox', 'doctor'], SANDBOX_OPTIONS)

    expect(rendered).toContain('CodeMind Sandbox Doctor')
    expect(rendered).toContain('Mode: READ-ONLY')
    expect(rendered).toContain('Execution enabled: false')
  })

  it('routes top-level sandbox image inspection without enabling execution', async () => {
    const rendered = await renderCodemindBinCommand(
      ['sandbox', 'inspect', 'node-22-bookworm-slim'],
      SANDBOX_OPTIONS,
    )

    expect(rendered).toContain('CodeMind Sandbox Image Inspection')
    expect(rendered).toContain('Image ID: node-22-bookworm-slim')
    expect(rendered).toContain('does not acquire, run, or mutate images')
  })

  it('leaves non-sandbox commands for the legacy CLI entrypoint', async () => {
    await expect(renderCodemindBinCommand(['doctor'], SANDBOX_OPTIONS)).resolves.toBeUndefined()
  })
})
