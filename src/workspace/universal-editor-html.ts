import { CODEMIND_WORKSPACE_I18N, CODEMIND_WORKSPACE_LOCALES } from './i18n.js'
import {
  CODE_RUNNER_DEFINITIONS,
  UNIVERSAL_LANGUAGE_REGISTRY,
  findLanguageDefinition,
  getDefaultWorkspaceLanguageId,
  isExecutableCapability,
} from './language-registry.js'
import {
  PYODIDE_BROWSER_RUNNER_ID,
  PYODIDE_BROWSER_RUNNER_LIMITS,
  buildPyodideWorkerSource,
} from './pyodide-browser-runner.js'
import {
  SQL_BROWSER_RUNNER_ID,
  SQL_BROWSER_RUNNER_LIMITS,
  buildSqlJsWorkerSource,
} from './sql-browser-runner.js'
import { createDefaultWorkspaceSession, type WorkspaceSession } from './workspace-session.js'
import { buildWorkspaceClientScript } from './workspace-client-script.js'
import type { CodeLanguageDefinition } from './language-registry.js'

export type UniversalWorkspaceClientPayload = {
  languages: readonly CodeLanguageDefinition[]
  runners: typeof CODE_RUNNER_DEFINITIONS
  defaultLanguageId: string
  locales: typeof CODEMIND_WORKSPACE_LOCALES
  translations: typeof CODEMIND_WORKSPACE_I18N
  chatUrl: string
  sqlWorkerSource: string
  sqlLimits: typeof SQL_BROWSER_RUNNER_LIMITS
  pyodideWorkerSource: string
  pyodideLimits: typeof PYODIDE_BROWSER_RUNNER_LIMITS
  defaultSession: WorkspaceSession
  projectBundleKind: 'codemind.workspace.project-bundle'
}

export type UniversalWorkspaceRenderOptions = {
  chatUrl?: string
}

export function createUniversalWorkspacePayload(
  options: UniversalWorkspaceRenderOptions = {},
): UniversalWorkspaceClientPayload {
  return {
    languages: UNIVERSAL_LANGUAGE_REGISTRY,
    runners: CODE_RUNNER_DEFINITIONS,
    defaultLanguageId: getDefaultWorkspaceLanguageId(),
    locales: CODEMIND_WORKSPACE_LOCALES,
    translations: CODEMIND_WORKSPACE_I18N,
    chatUrl: options.chatUrl ?? '#',
    sqlWorkerSource: buildSqlJsWorkerSource(),
    sqlLimits: SQL_BROWSER_RUNNER_LIMITS,
    pyodideWorkerSource: buildPyodideWorkerSource(),
    pyodideLimits: PYODIDE_BROWSER_RUNNER_LIMITS,
    defaultSession: createDefaultWorkspaceSession(),
    projectBundleKind: 'codemind.workspace.project-bundle',
  }
}

export function renderWorkspaceDisabledExecutionMessage(languageId: string): string {
  const language = findLanguageDefinition(languageId)

  if (
    language !== undefined &&
    isExecutableCapability(language.capability) &&
    language.runnerId !== undefined
  ) {
    return `${language.label} is executable through runner ${language.runnerId}.`
  }

  return 'This language currently supports editing, syntax highlighting, and AI assistance. Execution requires a configured sandbox runner.'
}

/** Standalone `<style>` tag for the Universal Workspace body markup. */
export function renderWorkspaceStyles(): string {
  return `<style>
    :root { color-scheme: dark; --bg:#080c16; --panel:#111a2f; --ink:#e8eefc; --muted:#9da9c2; --accent:#4b74ff; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding:20px; }
    main { max-width: 1280px; margin: 0 auto; }
    header, section { background: var(--panel); border:1px solid #283759; border-radius:18px; padding:18px; margin-bottom:14px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 5vw, 44px); }
    h2 { margin: 0 0 10px; font-size: 18px; }
    label { display:block; color: var(--muted); font-size: 13px; margin-bottom: 6px; }
    input, select, textarea { width:100%; border:1px solid #2a355f; border-radius:12px; background:#080c18; color:var(--ink); padding:10px; font: 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    input, select { font-family: inherit; }
    textarea { min-height: 440px; resize: vertical; line-height: 1.5; tab-size: 2; }
    button, a.button { border:0; border-radius:12px; padding:10px 14px; margin: 8px 8px 0 0; background:var(--accent); color:white; font-weight:700; cursor:pointer; text-decoration:none; display:inline-block; }
    button.secondary, a.button { background:#232c50; color:#dbe6ff; }
    button.file-tab { background:#0c1226; border:1px solid #2a355f; max-width: 240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    button.file-tab.active { outline:2px solid var(--accent); }
    button:disabled { opacity:0.48; cursor:not-allowed; }
    pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    iframe { width:100%; min-height:360px; border:1px solid #2a355f; border-radius:12px; background:white; }
    table { width:100%; border-collapse: collapse; margin-top:10px; font-size: 13px; }
    th, td { border:1px solid #2a355f; padding:6px 8px; text-align:left; vertical-align:top; }
    th { background:#0c1226; color:#dbe6ff; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr); gap:14px; }
    .controls, .session-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:12px; }
    .meta { display:grid; grid-template-columns: repeat(auto-fit, minmax(170px,1fr)); gap:10px; margin: 12px 0; }
    .meta-card { background:#0c1226; border:1px solid #2a355f; border-radius:12px; padding:10px; }
    .meta-card span { display:block; color:var(--muted); font-size:12px; }
    .task-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap:8px; }
    .task-grid button { width:100%; margin:0; }
    .file-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
    .session-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    #chat-draft-link, #import-session-json, #import-project-bundle-json { display:none; }
    #import-session-json, #import-project-bundle-json { min-height:150px; margin-top:10px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>`
}

/**
 * The Universal Workspace's inner `<header>`/`<section>` markup, without an
 * outer `<main>`/`<html>` wrapper, so it can be embedded directly inside the
 * unified app shell's `workspace` view as well as the standalone
 * `renderUniversalWorkspaceHtml()` document below.
 */
export function renderWorkspaceBodyMarkup(
  options: { readonly backLinkHref?: string } = {},
): string {
  const backLink =
    options.backLinkHref === undefined
      ? ''
      : `<p class="muted"><a href="${options.backLinkHref}" style="color:#dbe6ff">← Back to runtime dashboard</a></p>`

  return `<header>
      <h1 data-i18n="title">Universal Polyglot Workspace</h1>
      <p class="muted" data-i18n="subtitle">Edit, inspect, preview, and run only the languages with real registered runners.</p>
      ${backLink}
    </header>

    <section class="controls" aria-label="workspace controls">
      <div><label for="language-select" data-i18n="languageLabel">Programming language</label><select id="language-select"></select></div>
      <div><label for="target-language-select">Target language for translation</label><select id="target-language-select"></select></div>
      <div><label for="locale-select" data-i18n="localeLabel">UI language</label><select id="locale-select"></select></div>
    </section>

    <section aria-label="workspace session controls">
      <div class="session-grid">
        <div><label for="session-name">Session name</label><input id="session-name" type="text" /></div>
        <div><label>Persistence</label><p class="muted" id="session-status">Autosaved locally in this browser.</p></div>
      </div>
      <div id="file-tabs" class="file-tabs" aria-label="Workspace file tabs"></div>
      <div class="session-actions">
        <button id="new-file-button" class="secondary">New file</button>
        <button id="rename-file-button" class="secondary">Rename file</button>
        <button id="delete-file-button" class="secondary">Delete file</button>
        <button id="export-session-button" class="secondary">Export session JSON</button>
        <button id="show-import-session-button" class="secondary">Import session JSON</button>
        <button id="load-import-session-button" class="secondary">Load import JSON</button>
        <button id="export-project-bundle-button" class="secondary">Export project bundle JSON</button>
        <button id="show-import-project-bundle-button" class="secondary">Import project bundle JSON</button>
        <button id="load-project-bundle-button" class="secondary">Load project bundle</button>
      </div>
      <p class="muted">Project bundles are browser-local JSON project structures. They do not write files to a Git repository.</p>
      <textarea id="import-session-json" aria-label="Paste workspace session JSON"></textarea>
      <textarea id="import-project-bundle-json" aria-label="Paste workspace project bundle JSON"></textarea>
    </section>

    <div class="grid">
      <section>
        <div class="meta">
          <div class="meta-card"><span data-i18n="extensionLabel">File extension</span><strong id="extension-indicator"></strong></div>
          <div class="meta-card"><span data-i18n="capabilityLabel">Capability</span><strong id="capability-indicator"></strong></div>
          <div class="meta-card"><span>Runner</span><strong id="runner-indicator"></strong></div>
        </div>
        <textarea id="code-editor" spellcheck="false" aria-label="Code editor"></textarea>
        <div>
          <button id="run-button" disabled>Run</button>
          <button id="copy-code-button" class="secondary" data-i18n="copyButton">Copy code</button>
          <button id="reset-example-button" class="secondary" data-i18n="resetButton">Reset example</button>
          <button id="clear-output-button" class="secondary" data-i18n="clearButton">Clear output</button>
        </div>
        <p id="disabled-state" class="muted"></p>
      </section>

      <div>
        <section><h2 data-i18n="outputTitle">Output</h2><pre id="output-panel"></pre><div id="preview-panel" style="display:none;margin-top:10px"></div></section>
        <section><h2 data-i18n="errorsTitle">Errors</h2><pre id="errors-panel"></pre></section>
        <section><h2 data-i18n="diagnosticsTitle">Diagnostics</h2><pre id="diagnostics-panel"></pre></section>
        <section>
          <h2 data-i18n="aiTasksTitle">Code intelligence tasks</h2>
          <p class="muted">These buttons now prepare a real CodeMind chat/agent draft from selected code, language, diagnostics, output, errors, and verification status. They still do not claim translated code is equivalent until tests run.</p>
          <div class="task-grid">
            <button class="secondary" data-task="generate" data-i18n="generateTask">Generate code</button>
            <button class="secondary" data-task="explain" data-i18n="explainTask">Explain code</button>
            <button class="secondary" data-task="translate" data-i18n="translateTask">Translate code</button>
            <button class="secondary" data-task="review" data-i18n="reviewTask">Review for bugs</button>
            <button class="secondary" data-task="propose-tests" data-i18n="testsTask">Propose tests</button>
            <button class="secondary" data-task="compare-semantic-drift" data-i18n="driftTask">Compare semantic drift</button>
          </div>
          <a id="chat-draft-link" class="button" href="#" target="_blank" rel="noopener">Open draft in CodeMind Chat →</a>
          <p id="chat-draft-status" class="muted"></p>
        </section>
      </div>
    </div>`
}

/**
 * `<script>` tags wiring the payload data and client behavior for the
 * workspace body markup above. The client script body is wrapped in an
 * IIFE — classic (non-module) `<script>` tags in the same document share
 * one top-level lexical scope, so an unwrapped `const state`/`const el`
 * here would collide with the Agent view's own `const state`/`const el`
 * once both views are embedded together in the unified app shell.
 */
export function renderWorkspaceScripts(payload: UniversalWorkspaceClientPayload): string {
  return `<script id="workspace-data" type="application/json">${safeJson(payload)}</script>
  <script>(function () {${buildWorkspaceClientScript({ sqlRunnerId: SQL_BROWSER_RUNNER_ID, pyodideRunnerId: PYODIDE_BROWSER_RUNNER_ID })}})();</script>`
}

export function renderUniversalWorkspaceHtml(
  options: UniversalWorkspaceRenderOptions = {},
): string {
  const payload = createUniversalWorkspacePayload(options)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CodeMind Universal Polyglot Workspace</title>
  ${renderWorkspaceStyles()}
</head>
<body>
  <main>
    ${renderWorkspaceBodyMarkup({ backLinkHref: '/' })}
  </main>

  ${renderWorkspaceScripts(payload)}
</body>
</html>`
}

function safeJson(value: unknown): string {
  const json = JSON.stringify(value)

  if (json === undefined) {
    return 'null'
  }

  return json.replaceAll('</', '<\\/')
}
