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
    </div>
  </main>

  <script id="workspace-data" type="application/json">${safeJson(payload)}</script>
  <script>
    const payload = JSON.parse(document.getElementById('workspace-data').textContent);
    const SESSION_STORAGE_KEY = 'codemind.workspace.session.v1';
    const state = { locale: 'en', lastIntelligenceDraft: null };
    const SQL_RUNNER_ID = '${SQL_BROWSER_RUNNER_ID}';
    const PYODIDE_RUNNER_ID = '${PYODIDE_BROWSER_RUNNER_ID}';
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
    const fileTabs = el('file-tabs');
    const sessionNameInput = el('session-name');
    const sessionStatus = el('session-status');
    const importSessionJson = el('import-session-json');
    const importProjectBundleJson = el('import-project-bundle-json');
    let workspaceSession = loadStoredSession();

    function t(key) { return payload.translations[state.locale][key] || payload.translations.en[key] || key; }
    function languageById(languageId) { return payload.languages.find((language) => language.id === languageId) || payload.languages[0]; }
    function currentFile() { return workspaceSession.files.find((file) => file.id === workspaceSession.activeFileId) || workspaceSession.files[0]; }
    function currentLanguage() { return languageById(currentFile().languageId); }
    function targetLanguage() { return languageById(targetLanguageSelect.value || 'typescript'); }
    function hasRealRunner(language) { return Boolean(language.runnerId && payload.runners.some((runner) => runner.id === language.runnerId)); }
    function canRun(language) { return hasRealRunner(language) && ['browser-run', 'server-run', 'preview-only'].includes(language.capability); }
    function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
    function slugify(value) { const slug = String(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, ''); return slug || 'codemind-workspace'; }

    function loadStoredSession() {
      try {
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) return normalizeSession(JSON.parse(raw));
      } catch (_error) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      return normalizeSession(payload.defaultSession);
    }

    function normalizeSession(session) {
      if (!session || session.schemaVersion !== 1 || !Array.isArray(session.files) || session.files.length === 0) return structuredClone(payload.defaultSession);
      const files = session.files.filter((file) => file && typeof file.id === 'string' && languageById(file.languageId));
      if (files.length === 0) return structuredClone(payload.defaultSession);
      const activeFileId = files.some((file) => file.id === session.activeFileId) ? session.activeFileId : files[0].id;
      return {
        schemaVersion: 1,
        id: typeof session.id === 'string' ? session.id : 'local-session',
        name: typeof session.name === 'string' ? session.name : 'CodeMind Workspace Session',
        activeFileId,
        files: files.map((file) => ({
          id: file.id,
          name: typeof file.name === 'string' ? file.name : 'untitled.txt',
          languageId: languageById(file.languageId).id,
          code: typeof file.code === 'string' ? file.code : languageById(file.languageId).defaultSnippet,
          output: typeof file.output === 'string' ? file.output : '',
          errors: typeof file.errors === 'string' ? file.errors : '',
          diagnostics: typeof file.diagnostics === 'string' ? file.diagnostics : '',
          dirty: Boolean(file.dirty),
          createdAt: typeof file.createdAt === 'string' ? file.createdAt : new Date().toISOString(),
          updatedAt: typeof file.updatedAt === 'string' ? file.updatedAt : new Date().toISOString(),
        })),
        createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
        updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : new Date().toISOString(),
      };
    }

    function persistSession() {
      workspaceSession.updatedAt = new Date().toISOString();
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(workspaceSession, null, 2));
      sessionStatus.textContent = 'Autosaved locally at ' + new Date().toLocaleTimeString();
    }

    function saveCurrentFileState(markDirty) {
      const file = currentFile();
      if (!file) return;
      file.languageId = languageSelect.value || file.languageId;
      file.code = editor.value;
      file.output = outputPanel.textContent;
      file.errors = errorsPanel.textContent;
      file.diagnostics = diagnosticsPanel.textContent;
      file.dirty = markDirty === true ? true : file.dirty;
      file.updatedAt = new Date().toISOString();
      persistSession();
      renderFileTabs();
    }

    function renderFileTabs() {
      fileTabs.innerHTML = '';
      workspaceSession.files.forEach((file) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'file-tab' + (file.id === workspaceSession.activeFileId ? ' active' : '');
        button.textContent = (file.dirty ? '● ' : '') + file.name;
        button.title = file.languageId + ' · ' + file.name;
        button.addEventListener('click', () => selectFile(file.id));
        fileTabs.appendChild(button);
      });
    }

    function loadActiveFileIntoEditor() {
      const file = currentFile();
      const language = languageById(file.languageId);
      sessionNameInput.value = workspaceSession.name;
      languageSelect.value = language.id;
      editor.value = file.code;
      outputPanel.textContent = file.output;
      errorsPanel.textContent = file.errors;
      diagnosticsPanel.textContent = file.diagnostics || language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\n');
      previewPanel.innerHTML = '';
      previewPanel.style.display = 'none';
      updateLanguageView(false);
      renderFileTabs();
    }

    function selectFile(fileId) {
      if (fileId === workspaceSession.activeFileId) return;
      saveCurrentFileState(false);
      workspaceSession.activeFileId = fileId;
      persistSession();
      loadActiveFileIntoEditor();
    }

    function createClientFile(languageId, name, code) {
      const language = languageById(languageId);
      const now = new Date().toISOString();
      const id = 'file-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      return {
        id,
        name: name || 'untitled' + (language.extensions[0] || '.txt'),
        languageId: language.id,
        code: typeof code === 'string' ? code : language.defaultSnippet,
        output: '',
        errors: '',
        diagnostics: language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\n'),
        dirty: false,
        createdAt: now,
        updatedAt: now,
      };
    }

    function addFile() {
      saveCurrentFileState(false);
      const file = createClientFile(languageSelect.value || payload.defaultLanguageId);
      workspaceSession.files.push(file);
      workspaceSession.activeFileId = file.id;
      persistSession();
      loadActiveFileIntoEditor();
    }

    function renameFile() {
      const file = currentFile();
      const nextName = window.prompt('Rename file', file.name);
      if (!nextName || nextName.trim().length === 0) return;
      file.name = nextName.trim();
      file.dirty = true;
      persistSession();
      renderFileTabs();
    }

    function deleteFile() {
      if (workspaceSession.files.length <= 1) {
        window.alert('A workspace session must keep at least one file.');
        return;
      }
      const file = currentFile();
      if (!window.confirm('Delete ' + file.name + '?')) return;
      workspaceSession.files = workspaceSession.files.filter((candidate) => candidate.id !== file.id);
      workspaceSession.activeFileId = workspaceSession.files[0].id;
      persistSession();
      loadActiveFileIntoEditor();
    }

    function downloadJsonFile(fileName, value) {
      const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    }

    function exportSession() {
      saveCurrentFileState(false);
      downloadJsonFile(slugify(workspaceSession.name) + '.codemind-session.json', {
        exportedAt: new Date().toISOString(),
        session: workspaceSession,
      });
    }

    function importSession() {
      try {
        const parsed = JSON.parse(importSessionJson.value);
        workspaceSession = normalizeSession(parsed.session || parsed);
        persistSession();
        importSessionJson.style.display = 'none';
        loadActiveFileIntoEditor();
      } catch (error) {
        sessionStatus.textContent = 'Import failed: ' + (error.message || String(error));
      }
    }

    function detectLanguageIdByProjectPath(path) {
      const normalized = String(path).toLowerCase();
      const fileName = normalized.split('/').pop() || normalized;
      const match = payload.languages.find((language) => language.extensions.some((extension) => {
        const ext = String(extension).toLowerCase();
        return ext.startsWith('.') ? fileName.endsWith(ext) : fileName === ext || normalized.endsWith('/' + ext);
      }));
      return match ? match.id : 'markdown';
    }

    function safeProjectPath(path) {
      const value = String(path || '').trim().replaceAll('\\\\', '/').replace(/^\\/+/, '');
      if (!value || value.includes('..') || value.includes('\\\\')) throw new Error('Unsafe project bundle file path: ' + path);
      return value;
    }

    function exportProjectBundle() {
      saveCurrentFileState(false);
      const seen = new Set();
      const files = workspaceSession.files.map((file, index) => {
        let path = safeProjectPath(file.name);
        if (seen.has(path)) {
          const dot = path.lastIndexOf('.');
          path = dot > 0 ? path.slice(0, dot) + '-' + (index + 1) + path.slice(dot) : path + '-' + (index + 1);
        }
        seen.add(path);
        return { path, content: file.code };
      });
      const manifestFiles = files.map((file, index) => ({
        path: file.path,
        languageId: workspaceSession.files[index].languageId || detectLanguageIdByProjectPath(file.path),
        sizeBytes: new TextEncoder().encode(file.content).byteLength,
      }));
      const bundle = {
        kind: payload.projectBundleKind,
        schemaVersion: 1,
        manifest: {
          schemaVersion: 1,
          projectId: workspaceSession.id,
          name: workspaceSession.name,
          exportedAt: new Date().toISOString(),
          files: manifestFiles,
          safetyWarnings: [
            'This bundle is browser-local import/export data; importing it does not write to a Git repository.',
            'Review file names and code before running snippets or sending them to an AI provider.',
            'Executable capability still depends on CodeMind language registry runner support.',
          ],
        },
        files,
      };
      downloadJsonFile(slugify(workspaceSession.name) + '.codemind-project.json', bundle);
    }

    function importProjectBundle() {
      try {
        const parsed = JSON.parse(importProjectBundleJson.value);
        if (!parsed || parsed.kind !== payload.projectBundleKind || parsed.schemaVersion !== 1) throw new Error('Unsupported project bundle.');
        if (!parsed.manifest || !Array.isArray(parsed.manifest.files) || !Array.isArray(parsed.files) || parsed.files.length === 0) throw new Error('Project bundle requires manifest files and bundle files.');
        const now = new Date().toISOString();
        const files = parsed.files.map((bundleFile, index) => {
          const path = safeProjectPath(bundleFile.path);
          const manifestFile = parsed.manifest.files.find((file) => file.path === path) || {};
          const languageId = languageById(manifestFile.languageId || detectLanguageIdByProjectPath(path)).id;
          return createClientFile(languageId, path, typeof bundleFile.content === 'string' ? bundleFile.content : '');
        });
        workspaceSession = {
          schemaVersion: 1,
          id: 'project-' + slugify(parsed.manifest.projectId || parsed.manifest.name || 'workspace-project'),
          name: typeof parsed.manifest.name === 'string' ? parsed.manifest.name : 'Imported Project Bundle',
          activeFileId: files[0].id,
          files: files.map((file) => ({ ...file, createdAt: now, updatedAt: now })),
          createdAt: now,
          updatedAt: now,
        };
        persistSession();
        importProjectBundleJson.style.display = 'none';
        loadActiveFileIntoEditor();
      } catch (error) {
        sessionStatus.textContent = 'Project import failed: ' + (error.message || String(error));
      }
    }

    function renderOptions() {
      const options = payload.languages.map((language) => '<option value="' + escapeHtml(language.id) + '">' + escapeHtml(language.label + ' — ' + language.capability) + '</option>').join('');
      languageSelect.innerHTML = options;
      targetLanguageSelect.innerHTML = options;
      localeSelect.innerHTML = payload.locales.map((locale) => '<option value="' + escapeHtml(locale) + '">' + escapeHtml(locale.toUpperCase()) + '</option>').join('');
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
      const file = currentFile();
      const language = languageById(languageSelect.value || file.languageId);
      if (resetCode) {
        editor.value = language.defaultSnippet;
        outputPanel.textContent = '';
        errorsPanel.textContent = '';
        diagnosticsPanel.textContent = language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\n');
        file.dirty = true;
      }
      file.languageId = language.id;
      el('extension-indicator').textContent = language.extensions.join(', ');
      el('capability-indicator').textContent = language.capability;
      el('runner-indicator').textContent = language.runnerId || 'none';
      runButton.disabled = !canRun(language);
      updateRunButtonLabel();
      el('disabled-state').textContent = canRun(language) ? '' : t('disabledExecution');
      persistSession();
      renderFileTabs();
    }

    function clearPanels() {
      outputPanel.textContent = '';
      errorsPanel.textContent = '';
      previewPanel.innerHTML = '';
      previewPanel.style.display = 'none';
      saveCurrentFileState(true);
    }

    async function runSelectedCode() {
      const language = currentLanguage();
      clearPanels();
      diagnosticsPanel.textContent = language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\n');
      if (!canRun(language)) { errorsPanel.textContent = t('disabledExecution'); saveCurrentFileState(false); return; }
      if (language.runnerId === 'browser-javascript') { await runJavaScriptInWorker(editor.value); saveCurrentFileState(false); return; }
      if (language.runnerId === SQL_RUNNER_ID) { await runSqlInWorker(editor.value); saveCurrentFileState(false); return; }
      if (language.runnerId === PYODIDE_RUNNER_ID) { await runPythonInPyodideWorker(editor.value); saveCurrentFileState(false); return; }
      if (language.runnerId === 'html-preview') {
        previewPanel.style.display = 'block';
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', '');
        iframe.srcdoc = editor.value;
        previewPanel.appendChild(iframe);
        outputPanel.textContent = 'HTML preview rendered in sandboxed iframe.';
        saveCurrentFileState(false);
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
      saveCurrentFileState(false);
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
      return runGenericWorker(workerSource(code), {}, 1500, 'JavaScript execution timed out.');
    }

    function runSqlInWorker(code) {
      outputPanel.textContent = 'Running SQL through sql.js...';
      return runGenericWorker(payload.sqlWorkerSource, { code }, payload.sqlLimits.timeoutMs, 'SQL execution timed out after ' + payload.sqlLimits.timeoutMs + 'ms.', renderSqlResultSets);
    }

    function runPythonInPyodideWorker(code) {
      outputPanel.textContent = 'Loading Pyodide and running Python...';
      return runGenericWorker(payload.pyodideWorkerSource, { code }, payload.pyodideLimits.timeoutMs, 'Python execution timed out after ' + payload.pyodideLimits.timeoutMs + 'ms.');
    }

    function runGenericWorker(source, message, timeoutMs, timeoutMessage, onResult) {
      return new Promise((resolve) => {
        const blob = new Blob([source], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        const timer = window.setTimeout(() => {
          worker.terminate();
          URL.revokeObjectURL(url);
          outputPanel.textContent = '';
          errorsPanel.textContent = timeoutMessage;
          resolve();
        }, timeoutMs);
        worker.onmessage = (event) => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(url);
          worker.terminate();
          const result = event.data;
          outputPanel.textContent = result.output || '';
          errorsPanel.textContent = (result.errors || []).join('\n');
          if (typeof onResult === 'function') onResult(result.resultSets || []);
          resolve();
        };
        worker.onerror = (event) => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(url);
          worker.terminate();
          outputPanel.textContent = '';
          errorsPanel.textContent = event.message || 'Worker error';
          resolve();
        };
        if (Object.keys(message).length > 0) worker.postMessage(message);
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
      saveCurrentFileState(false);
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
        saveCurrentFileState(false);
      } catch (error) {
        el('chat-draft-status').textContent = 'Failed to prepare chat draft: ' + (error.message || String(error));
      }
    }

    sessionNameInput.addEventListener('input', () => { workspaceSession.name = sessionNameInput.value || 'CodeMind Workspace Session'; persistSession(); });
    editor.addEventListener('input', () => saveCurrentFileState(true));
    languageSelect.addEventListener('change', () => { updateLanguageView(true); clearPanels(); });
    localeSelect.addEventListener('change', () => { state.locale = localeSelect.value; applyTranslations(); updateLanguageView(false); });
    runButton.addEventListener('click', () => { runSelectedCode().catch((error) => { errorsPanel.textContent = error && error.stack ? error.stack : String(error); saveCurrentFileState(false); }); });
    el('copy-code-button').addEventListener('click', () => navigator.clipboard.writeText(editor.value));
    el('reset-example-button').addEventListener('click', () => updateLanguageView(true));
    el('clear-output-button').addEventListener('click', clearPanels);
    el('new-file-button').addEventListener('click', addFile);
    el('rename-file-button').addEventListener('click', renameFile);
    el('delete-file-button').addEventListener('click', deleteFile);
    el('export-session-button').addEventListener('click', exportSession);
    el('show-import-session-button').addEventListener('click', () => { importSessionJson.style.display = importSessionJson.style.display === 'block' ? 'none' : 'block'; });
    el('load-import-session-button').addEventListener('click', importSession);
    el('export-project-bundle-button').addEventListener('click', exportProjectBundle);
    el('show-import-project-bundle-button').addEventListener('click', () => { importProjectBundleJson.style.display = importProjectBundleJson.style.display === 'block' ? 'none' : 'block'; });
    el('load-project-bundle-button').addEventListener('click', importProjectBundle);
    document.querySelectorAll('[data-task]').forEach((button) => button.addEventListener('click', () => { showAiTask(button.getAttribute('data-task')).catch((error) => { el('chat-draft-status').textContent = error.message || String(error); }); }));

    renderOptions();
    applyTranslations();
    loadActiveFileIntoEditor();
    persistSession();
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
