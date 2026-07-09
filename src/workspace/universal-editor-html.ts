import { CODEMIND_WORKSPACE_I18N, CODEMIND_WORKSPACE_LOCALES } from './i18n.js'
import {
  CODE_RUNNER_DEFINITIONS,
  UNIVERSAL_LANGUAGE_REGISTRY,
  findLanguageDefinition,
  getDefaultWorkspaceLanguageId,
  isExecutableCapability,
} from './language-registry.js'
import {
  SQL_BROWSER_RUNNER_ID,
  SQL_BROWSER_RUNNER_LIMITS,
  buildSqlJsWorkerSource,
} from './sql-browser-runner.js'
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
  <style>
    :root { color-scheme: dark; --bg:#080c16; --panel:#111a2f; --ink:#e8eefc; --muted:#9da9c2; --accent:#4b74ff; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding:20px; }
    main { max-width: 1280px; margin: 0 auto; }
    header, section { background: var(--panel); border:1px solid #283759; border-radius:18px; padding:18px; margin-bottom:14px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 5vw, 44px); }
    h2 { margin: 0 0 10px; font-size: 18px; }
    label { display:block; color: var(--muted); font-size: 13px; margin-bottom: 6px; }
    select, textarea { width:100%; border:1px solid #2a355f; border-radius:12px; background:#080c18; color:var(--ink); padding:10px; font: 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    select { font-family: inherit; }
    textarea { min-height: 440px; resize: vertical; line-height: 1.5; tab-size: 2; }
    button, a.button { border:0; border-radius:12px; padding:10px 14px; margin: 8px 8px 0 0; background:var(--accent); color:white; font-weight:700; cursor:pointer; text-decoration:none; display:inline-block; }
    button.secondary, a.button { background:#232c50; color:#dbe6ff; }
    button:disabled { opacity:0.48; cursor:not-allowed; }
    pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    iframe { width:100%; min-height:360px; border:1px solid #2a355f; border-radius:12px; background:white; }
    table { width:100%; border-collapse: collapse; margin-top:10px; font-size: 13px; }
    th, td { border:1px solid #2a355f; padding:6px 8px; text-align:left; vertical-align:top; }
    th { background:#0c1226; color:#dbe6ff; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr); gap:14px; }
    .controls { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:12px; }
    .meta { display:grid; grid-template-columns: repeat(auto-fit, minmax(170px,1fr)); gap:10px; margin: 12px 0; }
    .meta-card { background:#0c1226; border:1px solid #2a355f; border-radius:12px; padding:10px; }
    .meta-card span { display:block; color:var(--muted); font-size:12px; }
    .task-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap:8px; }
    .task-grid button { width:100%; margin:0; }
    #chat-draft-link { display:none; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1 data-i18n="title">Universal Polyglot Workspace</h1>
      <p class="muted" data-i18n="subtitle">Edit, inspect, preview, and run only the languages with real registered runners.</p>
      <p class="muted"><a href="/" style="color:#dbe6ff">← Back to runtime dashboard</a></p>
    </header>

    <section class="controls" aria-label="workspace controls">
      <div><label for="language-select" data-i18n="languageLabel">Programming language</label><select id="language-select"></select></div>
      <div><label for="target-language-select">Target language for translation</label><select id="target-language-select"></select></div>
      <div><label for="locale-select" data-i18n="localeLabel">UI language</label><select id="locale-select"></select></div>
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
    </div>
  </main>

  <script id="workspace-data" type="application/json">${safeJson(payload)}</script>
  <script>
    const payload = JSON.parse(document.getElementById('workspace-data').textContent);
    const state = { languageId: payload.defaultLanguageId, locale: 'en', lastIntelligenceDraft: null };
    const SQL_RUNNER_ID = '${SQL_BROWSER_RUNNER_ID}';
    const el = (id) => document.getElementById(id);
    const languageSelect = el('language-select');
    const targetLanguageSelect = el('target-language-select');
    const localeSelect = el('locale-select');
    const editor = el('code-editor');
    const runButton = el('run-button');
    const outputPanel = el('output-panel');
    const errorsPanel = el('errors-panel');
    const diagnosticsPanel = el('diagnostics-panel');
    const previewPanel = el('preview-panel');

    function t(key) { return payload.translations[state.locale][key] || payload.translations.en[key] || key; }
    function currentLanguage() { return payload.languages.find((language) => language.id === state.languageId) || payload.languages[0]; }
    function targetLanguage() { return payload.languages.find((language) => language.id === targetLanguageSelect.value) || payload.languages.find((language) => language.id === 'typescript') || payload.languages[0]; }
    function hasRealRunner(language) { return Boolean(language.runnerId && payload.runners.some((runner) => runner.id === language.runnerId)); }
    function canRun(language) { return hasRealRunner(language) && ['browser-run', 'server-run', 'preview-only'].includes(language.capability); }
    function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }

    function renderOptions() {
      const options = payload.languages.map((language) => '<option value="' + escapeHtml(language.id) + '">' + escapeHtml(language.label + ' — ' + language.capability) + '</option>').join('');
      languageSelect.innerHTML = options;
      targetLanguageSelect.innerHTML = options;
      localeSelect.innerHTML = payload.locales.map((locale) => '<option value="' + escapeHtml(locale) + '">' + escapeHtml(locale.toUpperCase()) + '</option>').join('');
      languageSelect.value = state.languageId;
      targetLanguageSelect.value = payload.languages.some((language) => language.id === 'typescript') ? 'typescript' : payload.defaultLanguageId;
      localeSelect.value = state.locale;
    }

    function applyTranslations() {
      document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.getAttribute('data-i18n')); });
      updateRunButtonLabel();
    }

    function updateRunButtonLabel() {
      const language = currentLanguage();
      runButton.textContent = language.capability === 'preview-only' ? t('previewButton') : t('runButton');
    }

    function updateLanguageView(resetCode) {
      const language = currentLanguage();
      if (resetCode) editor.value = language.defaultSnippet;
      el('extension-indicator').textContent = language.extensions.join(', ');
      el('capability-indicator').textContent = language.capability;
      el('runner-indicator').textContent = language.runnerId || 'none';
      diagnosticsPanel.textContent = language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\n');
      runButton.disabled = !canRun(language);
      updateRunButtonLabel();
      el('disabled-state').textContent = canRun(language) ? '' : t('disabledExecution');
    }

    function clearPanels() {
      outputPanel.textContent = '';
      errorsPanel.textContent = '';
      previewPanel.innerHTML = '';
      previewPanel.style.display = 'none';
    }

    async function runSelectedCode() {
      const language = currentLanguage();
      clearPanels();
      diagnosticsPanel.textContent = language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\n');
      if (!canRun(language)) { errorsPanel.textContent = t('disabledExecution'); return; }
      if (language.runnerId === 'browser-javascript') { await runJavaScriptInWorker(editor.value); return; }
      if (language.runnerId === SQL_RUNNER_ID) { await runSqlInWorker(editor.value); return; }
      if (language.runnerId === 'html-preview') {
        previewPanel.style.display = 'block';
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', '');
        iframe.srcdoc = editor.value;
        previewPanel.appendChild(iframe);
        outputPanel.textContent = 'HTML preview rendered in sandboxed iframe.';
        return;
      }
      const response = await fetch('/api/workspace/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ languageId: language.id, code: editor.value }),
      });
      const result = await response.json();
      outputPanel.textContent = result.output || '';
      errorsPanel.textContent = (result.errors || []).join('\n');
      diagnosticsPanel.textContent = (result.diagnostics || []).join('\n');
    }

    function workerSource(code) {
      return [
        'const __logs = [];',
        'const __format = (value) => {',
        "  if (typeof value === 'string') return value;",
        "  try { return JSON.stringify(value); } catch (_error) { return String(value); }",
        '};',
        'const console = {',
        "  log: (...values) => __logs.push(values.map(__format).join(' ')),",
        "  error: (...values) => __logs.push(values.map(__format).join(' ')),",
        "  warn: (...values) => __logs.push(values.map(__format).join(' ')),",
        '};',
        'const fetch = undefined;',
        'const XMLHttpRequest = undefined;',
        'const importScripts = undefined;',
        'try {',
        code,
        "  postMessage({ ok: true, output: __logs.join('\\n'), errors: [] });",
        '} catch (error) {',
        "  postMessage({ ok: false, output: __logs.join('\\n'), errors: [error && error.stack ? error.stack : String(error)] });",
        '}',
      ].join('\n');
    }

    function runJavaScriptInWorker(code) {
      return new Promise((resolve) => {
        const blob = new Blob([workerSource(code)], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        const timer = window.setTimeout(() => {
          worker.terminate();
          URL.revokeObjectURL(url);
          errorsPanel.textContent = 'JavaScript execution timed out.';
          resolve();
        }, 1500);
        worker.onmessage = (event) => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(url);
          outputPanel.textContent = event.data.output || '';
          errorsPanel.textContent = (event.data.errors || []).join('\n');
          worker.terminate();
          resolve();
        };
        worker.onerror = (event) => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(url);
          errorsPanel.textContent = event.message || 'JavaScript worker error';
          worker.terminate();
          resolve();
        };
      });
    }

    function runSqlInWorker(code) {
      return new Promise((resolve) => {
        outputPanel.textContent = 'Running SQL through sql.js...';
        const blob = new Blob([payload.sqlWorkerSource], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        const timer = window.setTimeout(() => {
          worker.terminate();
          URL.revokeObjectURL(url);
          outputPanel.textContent = '';
          errorsPanel.textContent = 'SQL execution timed out after ' + payload.sqlLimits.timeoutMs + 'ms.';
          resolve();
        }, payload.sqlLimits.timeoutMs);
        worker.onmessage = (event) => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(url);
          worker.terminate();
          const result = event.data;
          outputPanel.textContent = result.output || '';
          errorsPanel.textContent = (result.errors || []).join('\n');
          renderSqlResultSets(result.resultSets || []);
          resolve();
        };
        worker.onerror = (event) => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(url);
          worker.terminate();
          outputPanel.textContent = '';
          errorsPanel.textContent = event.message || 'SQL worker error';
          resolve();
        };
        worker.postMessage({ code });
      });
    }

    function renderSqlResultSets(resultSets) {
      previewPanel.innerHTML = '';
      previewPanel.style.display = resultSets.length === 0 ? 'none' : 'block';
      resultSets.forEach((set, setIndex) => {
        const title = document.createElement('p');
        title.className = 'muted';
        title.textContent = 'Result set ' + (setIndex + 1) + (set.truncatedRows ? ' (truncated)' : '');
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        set.columns.forEach((column) => {
          const th = document.createElement('th');
          th.textContent = column;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        set.values.forEach((row) => {
          const tr = document.createElement('tr');
          row.forEach((cell) => {
            const td = document.createElement('td');
            td.textContent = cell === null || cell === undefined ? 'NULL' : String(cell);
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        previewPanel.appendChild(title);
        previewPanel.appendChild(table);
      });
    }

    async function showAiTask(task) {
      const language = currentLanguage();
      const target = targetLanguage();
      el('chat-draft-status').textContent = 'Preparing CodeMind chat draft...';
      el('chat-draft-link').style.display = 'none';
      try {
        const response = await fetch('/api/workspace/intelligence', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: task,
            code: editor.value,
            sourceLanguageId: language.id,
            selectedLanguageId: language.id,
            targetLanguageId: task === 'translate' || task === 'compare-semantic-drift' ? target.id : undefined,
            diagnostics: diagnosticsPanel.textContent,
            output: outputPanel.textContent,
            errors: errorsPanel.textContent,
            verificationStatus: 'UNVERIFIED',
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to prepare draft');
        state.lastIntelligenceDraft = result.chatDraft.message;
        outputPanel.textContent = result.prompt;
        errorsPanel.textContent = '';
        el('chat-draft-status').textContent = 'Draft prepared: ' + result.chatDraft.summary + ' · suggested agent mode ' + result.suggestedAgentMode;
        const draftUrl = new URL(payload.chatUrl, window.location.href);
        draftUrl.searchParams.set('draft', result.chatDraft.message);
        draftUrl.searchParams.set('agentMode', result.suggestedAgentMode);
        el('chat-draft-link').href = draftUrl.toString();
        el('chat-draft-link').style.display = 'inline-block';
      } catch (error) {
        el('chat-draft-status').textContent = 'Failed to prepare chat draft: ' + (error.message || String(error));
      }
    }

    languageSelect.addEventListener('change', () => { state.languageId = languageSelect.value; updateLanguageView(true); clearPanels(); });
    localeSelect.addEventListener('change', () => { state.locale = localeSelect.value; applyTranslations(); updateLanguageView(false); });
    runButton.addEventListener('click', () => { runSelectedCode().catch((error) => { errorsPanel.textContent = error && error.stack ? error.stack : String(error); }); });
    el('copy-code-button').addEventListener('click', () => navigator.clipboard.writeText(editor.value));
    el('reset-example-button').addEventListener('click', () => updateLanguageView(true));
    el('clear-output-button').addEventListener('click', clearPanels);
    document.querySelectorAll('[data-task]').forEach((button) => button.addEventListener('click', () => { showAiTask(button.getAttribute('data-task')).catch((error) => { el('chat-draft-status').textContent = error.message || String(error); }); }));

    renderOptions();
    applyTranslations();
    updateLanguageView(true);
  </script>
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
