import { describe, expect, it } from 'vitest'

import { renderSandboxCommand } from './cli-sandbox.js'

describe('sandbox CLI renderer', () => {
  it('renders sandbox doctor diagnostics by default', async () => {
    const rendered = await renderSandboxCommand(['doctor'])

    expect(rendered).toContain('CodeMind Sandbox Doctor')
    expect(rendered).toContain('Mode: READ-ONLY')
    expect(rendered).toContain('Execution enabled: false')
  })

  it('renders sandbox image policy diagnostics', async () => {
    const rendered = await renderSandboxCommand(['images'])

    expect(rendered).toContain('CodeMind Sandbox Images')
    expect(rendered).toContain('does not pull images automatically')
  })

  it('keeps unsupported sandbox subcommands inactive', async () => {
    const rendered = await renderSandboxCommand(['run', 'example.py'])

    expect(rendered).toContain('not active')
    expect(rendered).toContain('sandbox run example.py')
  })
})
