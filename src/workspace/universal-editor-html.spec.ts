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
    expect(html).toContain('target-language-select')
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

  it('renders multi-file session controls and local persistence wiring', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('session-name')
    expect(html).toContain('file-tabs')
    expect(html).toContain('new-file-button')
    expect(html).toContain('rename-file-button')
    expect(html).toContain('delete-file-button')
    expect(html).toContain('export-session-button')
    expect(html).toContain('import-session-json')
    expect(html).toContain('symbolwright.workspace.session.v1')
    expect(html).toContain('window.localStorage.setItem')
  })

  it('renders project bundle import/export controls and safety copy', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('export-project-bundle-button')
    expect(html).toContain('show-import-project-bundle-button')
    expect(html).toContain('load-project-bundle-button')
    expect(html).toContain('import-project-bundle-json')
    expect(html).toContain('Project bundles are browser-local JSON project structures')
    expect(html).toContain('symbolwright.workspace.project-bundle')
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

  it('includes the configured chat URL in the workspace payload', () => {
    const payload = createUniversalWorkspacePayload({ chatUrl: 'http://localhost:8787' })

    expect(payload.chatUrl).toBe('http://localhost:8787')
  })

  it('embeds a default workspace session and project bundle kind in the payload', () => {
    const payload = createUniversalWorkspacePayload()

    expect(payload.defaultSession.schemaVersion).toBe(1)
    expect(payload.defaultSession.files).toHaveLength(1)
    expect(payload.defaultSession.activeFileId).toBe(payload.defaultSession.files[0]?.id)
    expect(payload.projectBundleKind).toBe('symbolwright.workspace.project-bundle')
  })

  it('embeds the sql.js worker source and SQL runner limits in the payload', () => {
    const payload = createUniversalWorkspacePayload()

    expect(payload.sqlWorkerSource).toContain("importScripts('/vendor/sql-wasm.js')")
    expect(payload.sqlWorkerSource).toContain('db.exec(code)')
    expect(payload.sqlLimits.timeoutMs).toBe(2_000)
  })

  it('embeds the Pyodide worker source and Python runner limits in the payload', () => {
    const payload = createUniversalWorkspacePayload()

    expect(payload.pyodideWorkerSource).toContain('loadPyodide')
    expect(payload.pyodideWorkerSource).toContain('runPythonAsync(code)')
    expect(payload.pyodideLimits.timeoutMs).toBe(8_000)
  })

  it('shows the exact honest disabled state for edit-only languages', () => {
    expect(renderWorkspaceDisabledExecutionMessage('ruby')).toBe(
      'This language currently supports editing, syntax highlighting, and AI assistance. Execution requires a configured sandbox runner.',
    )
  })

  it('shows SQL and Python as executable through their real browser runners', () => {
    expect(renderWorkspaceDisabledExecutionMessage('sql')).toBe(
      'SQL is executable through runner browser-sqljs.',
    )
    expect(renderWorkspaceDisabledExecutionMessage('python')).toBe(
      'Python is executable through runner browser-pyodide.',
    )
  })

  it('renders real localization resources and a UI language selector', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('locale-select')
    expect(html).toContain('Espacio de trabajo políglota universal')
    expect(html).toContain('Universal Polyglot Workspace')
  })

  it('wires code-intelligence buttons to the real workspace bridge endpoint and chat draft link', () => {
    const html = renderUniversalWorkspaceHtml({ chatUrl: 'http://localhost:8787' })

    expect(html).toContain('/api/workspace/intelligence')
    expect(html).toContain('chat-draft-link')
    expect(html).toContain('result.chatDraft.message')
    expect(html).toContain('agentMode')
    expect(html).toContain('targetLanguageId')
    expect(html).toContain('suggestedAgentMode')
  })

  it('wires SQL Run to the browser sql.js worker and table renderer', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('const SQL_RUNNER_ID = "browser-sqljs"')
    expect(html).toContain('runSqlInWorker(editor.value)')
    expect(html).toContain('renderSqlResultSets')
    expect(html).toContain('SQL execution timed out')
    expect(html).toContain("document.createElement('table')")
  })

  it('wires Python Run to the browser Pyodide worker', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('const PYODIDE_RUNNER_ID = "browser-pyodide"')
    expect(html).toContain('runPythonInPyodideWorker(editor.value)')
    expect(html).toContain('Loading Pyodide and running Python')
    expect(html).toContain('Python execution timed out')
  })

  it('wires project bundle export/import functions in the client script', () => {
    const html = renderUniversalWorkspaceHtml()

    expect(html).toContain('function exportProjectBundle')
    expect(html).toContain('function importProjectBundle')
    expect(html).toContain('detectLanguageIdByProjectPath')
    expect(html).toContain('does not write to a Git repository')
    expect(html).toContain(
      "el('export-project-bundle-button').addEventListener('click', exportProjectBundle)",
    )
  })
})
