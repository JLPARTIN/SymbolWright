import { describe, expect, it } from 'vitest'

import { renderSandboxCommand } from './cli-sandbox.js'
import { runnerAvailability } from './sandbox/sandbox-registry.js'

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

  it('keeps unsupported sandbox subcommands inactive', async () => {
    const rendered = await renderSandboxCommand(['run', 'example.py'], OPTIONS)

    expect(rendered).toContain('not active')
    expect(rendered).toContain('sandbox run example.py')
  })
})
