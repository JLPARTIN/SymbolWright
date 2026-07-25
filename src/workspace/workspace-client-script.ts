import {
  detectWorkspaceLanguageIdByProjectPath,
  safeWorkspaceProjectPath,
  slugifyWorkspaceName,
} from './workspace-client-logic.js'

/**
 * Builds the Universal Workspace browser `<script>` body. Behaviorally
 * equivalent to the inline script that used to live directly inside
 * `universal-editor-html.ts`'s template literal — the three pure helpers
 * (`slugify`, `safeProjectPath`, `detectLanguageIdByProjectPath`) are now
 * sourced from `workspace-client-logic.ts` via `fn.toString()` so they are
 * unit-tested in Node and still run unmodified in the browser.
 *
 * `emitDraftHandoff`, when provided, is called instead of building a
 * `chatUrl` link — used by the unified app shell to hand a code-intelligence
 * draft to the embedded Agent view in-page instead of via a separate page.
 */
export function buildWorkspaceClientScript(options: {
  readonly sqlRunnerId: string
  readonly pyodideRunnerId: string
}): string {
  return `
    const payload = JSON.parse(document.getElementById('workspace-data').textContent);
    const SESSION_STORAGE_KEY = 'symbolwright.workspace.session.v1';
    const state = { locale: 'en', lastIntelligenceDraft: null };
    const SQL_RUNNER_ID = ${JSON.stringify(options.sqlRunnerId)};
    const PYODIDE_RUNNER_ID = ${JSON.stringify(options.pyodideRunnerId)};
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

    ${slugifyWorkspaceName.toString()}
    ${safeWorkspaceProjectPath.toString()}
    ${detectWorkspaceLanguageIdByProjectPath.toString()}
    function slugify(value) { return slugifyWorkspaceName(value); }
    function safeProjectPath(path) { return safeWorkspaceProjectPath(path); }
    function detectLanguageIdByProjectPath(path) { return detectWorkspaceLanguageIdByProjectPath(path, payload.languages); }

    function t(key) { return payload.translations[state.locale][key] || payload.translations.en[key] || key; }
    function languageById(languageId) { return payload.languages.find((language) => language.id === languageId) || payload.languages[0]; }
    function currentFile() { return workspaceSession.files.find((file) => file.id === workspaceSession.activeFileId) || workspaceSession.files[0]; }
    function currentLanguage() { return languageById(currentFile().languageId); }
    function targetLanguage() { return languageById(targetLanguageSelect.value || 'typescript'); }
    function hasRealRunner(language) { return Boolean(language.runnerId && payload.runners.some((runner) => runner.id === language.runnerId)); }
    function canRun(language) { return hasRealRunner(language) && ['browser-run', 'server-run', 'preview-only'].includes(language.capability); }
    function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }

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
        name: typeof session.name === 'string' ? session.name : 'SymbolWright Workspace Session',
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
      diagnosticsPanel.textContent = file.diagnostics || language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\\n');
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
        diagnostics: language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\\n'),
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
      const blob = new Blob([JSON.stringify(value, null, 2) + '\\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    }

    function exportSession() {
      saveCurrentFileState(false);
      downloadJsonFile(slugify(workspaceSession.name) + '.symbolwright-session.json', {
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
            'Executable capability still depends on SymbolWright language registry runner support.',
          ],
        },
        files,
      };
      downloadJsonFile(slugify(workspaceSession.name) + '.symbolwright-project.json', bundle);
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
        diagnosticsPanel.textContent = language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\\n');
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
      diagnosticsPanel.textContent = language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\\n');
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
      errorsPanel.textContent = (result.errors || []).join('\\n');
      diagnosticsPanel.textContent = (result.diagnostics || []).join('\\n');
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
        "  postMessage({ ok: true, output: __logs.join('\\\\n'), errors: [] });",
        '} catch (error) {',
        "  postMessage({ ok: false, output: __logs.join('\\\\n'), errors: [error && error.stack ? error.stack : String(error)] });",
        '}',
      ].join('\\n');
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
          errorsPanel.textContent = (result.errors || []).join('\\n');
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
      el('chat-draft-status').textContent = 'Preparing SymbolWright chat draft...';
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
        if (typeof window.symbolWrightHandleWorkspaceDraft === 'function') {
          window.symbolWrightHandleWorkspaceDraft(result.chatDraft.message, result.suggestedAgentMode);
        } else {
          const draftUrl = new URL(payload.chatUrl, window.location.href);
          draftUrl.searchParams.set('draft', result.chatDraft.message);
          draftUrl.searchParams.set('agentMode', result.suggestedAgentMode);
          el('chat-draft-link').href = draftUrl.toString();
          el('chat-draft-link').style.display = 'inline-block';
        }
        saveCurrentFileState(false);
      } catch (error) {
        el('chat-draft-status').textContent = 'Failed to prepare chat draft: ' + (error.message || String(error));
      }
    }

    sessionNameInput.addEventListener('input', () => { workspaceSession.name = sessionNameInput.value || 'SymbolWright Workspace Session'; persistSession(); });
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
  `
}
