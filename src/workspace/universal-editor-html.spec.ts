import { describe, expect, it } from 'vitest'

import {
  createUniversalWorkspacePayload,
  renderUniversalWorkspaceHtml,
  renderWorkspaceDisabledExecutionMessage,
} from './universal-editor-html.js'

describe('universal editor html', () => {
  it('renders the real editor controls and panels', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('language-select')
    expect(html).toContain('code-editor')
    expect(html).toContain('run-button')
    expect(html).toContain('copy-code-button')
    expect(html).toContain('reset-example-button')
    expect(html).toContain('clear-output-button')
    expect(html).toContain('output-panel')
    expect(html).toContain('errors-panel')
    expect(html).toContain('diagnostics-panel')
    expect(html).toContain('extension-indicator')
  })

  it('embeds only registered runner ids in the client payload', () => {
    const payload = createUniversalWorkspacePayload()
    const runnerIds = new Set(payload.runners.map((runner) => runner.id))

    for (const language of payload.languages) {
      if (language.runnerId !== undefined) {
        expect(runnerIds.has(language.runnerId)).toBe(true)
      }
    }
  })

  it('shows the exact honest disabled state for edit-only languages', () => {
    expect(renderWorkspaceDisabledExecutionMessage('python')).toBe(
      'This language currently supports editing, syntax highlighting, and AI assistance. Execution requires a configured sandbox runner.',
    )
  })

  it('renders real localization resources and a UI language selector', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('locale-select')
    expect(html).toContain('Espacio de trabajo políglota universal')
    expect(html).toContain('Universal Polyglot Workspace')
  })
})
