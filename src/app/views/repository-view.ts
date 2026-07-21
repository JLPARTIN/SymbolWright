/**
 * The unified shell's `#/repository` view (Large PR Bundle 2) — a real
 * repository work surface: browses and edits the actual checked-out git
 * working tree, shows real git status/diffs, and supports branch/commit/
 * push/PR-creation actions. Deliberately separate from the Workspace tab,
 * which stays a browser-localStorage-only "Scratch Workspace" (Bundle 1) --
 * writes here go straight to the real files on disk through the
 * checkpoint-bound guarded write path.
 */
export function renderRepositoryViewHtml(): string {
  return `<section data-view="repository" class="app-view" style="display:none">
    <h2>Repository</h2>
    <p class="muted">Real, local repository workspace. Reads and writes the actual checked-out working tree on disk (not the browser-local Scratch Workspace in the Workspace tab). Every write is checkpointed first.</p>
    <div id="repo-status-line" class="muted">Connect with your CodeMind API key in Settings to open the repository.</div>

    <div class="repo-layout">
      <div class="repo-tree-panel card">
        <div class="repo-branch-row">
          <label for="repo-branch-select">Branch</label>
          <select id="repo-branch-select"></select>
          <button type="button" class="secondary" id="repo-new-branch-btn">New branch</button>
        </div>
        <div id="repo-tree" class="repo-tree"></div>
      </div>

      <div class="repo-editor-panel card">
        <div id="repo-file-path" class="muted">No file open.</div>
        <textarea id="repo-editor" class="repo-editor" spellcheck="false" disabled></textarea>
        <button type="button" id="repo-save-btn" disabled>Save</button>
        <div id="repo-save-status" class="muted"></div>

        <div class="repo-sandbox-panel card">
          <h3>Run</h3>
          <p class="muted">Execute the open repository file through the structured sandbox API. No arbitrary shell commands are accepted.</p>
          <div class="row">
            <div><label for="repo-sandbox-mode">Mode</label><select id="repo-sandbox-mode"><option value="run">Run File</option><option value="compile">Compile File</option><option value="test">Test Project</option></select></div>
            <div><label for="repo-sandbox-runner">Runner</label><select id="repo-sandbox-runner"></select></div>
          </div>
          <label for="repo-sandbox-stdin">stdin</label>
          <textarea id="repo-sandbox-stdin" placeholder="Optional standard input"></textarea>
          <label for="repo-sandbox-args">Arguments</label>
          <input id="repo-sandbox-args" placeholder="Optional whitespace-separated args" />
          <button type="button" id="repo-sandbox-run-btn" disabled>Run</button>
          <button type="button" class="secondary" id="repo-sandbox-cancel-btn" disabled>Cancel</button>
          <div id="repo-sandbox-status" class="muted">Open a supported file to run it.</div>
          <pre id="repo-sandbox-result" class="repo-diff"></pre>
        </div>
      </div>

      <div class="repo-changes-panel card">
        <h3>Changes</h3>
        <button type="button" class="secondary" id="repo-refresh-status-btn">Refresh status</button>
        <div id="repo-changes-list"></div>
        <pre id="repo-diff-content" class="repo-diff"></pre>

        <h3>Commit</h3>
        <textarea id="repo-commit-message" placeholder="Commit message"></textarea>
        <button type="button" id="repo-commit-btn">Commit all changes</button>
        <div id="repo-commit-status" class="muted"></div>

        <h3>Push</h3>
        <button type="button" class="secondary" id="repo-push-btn">Push current branch</button>
        <div id="repo-push-status" class="muted"></div>

        <h3>Create pull request</h3>
        <p class="muted">Creates a real draft PR via the GitHub API (requires GITHUB_TOKEN on the server) -- no local push required for this path.</p>
        <input id="repo-pr-title" placeholder="Title" />
        <textarea id="repo-pr-body" placeholder="Description"></textarea>
        <div class="row">
          <div><label for="repo-pr-base">Base branch</label><input id="repo-pr-base" placeholder="main" /></div>
          <div><label for="repo-pr-head">Head branch</label><input id="repo-pr-head" placeholder="(current branch)" /></div>
        </div>
        <button type="button" class="secondary" id="repo-pr-btn">Create draft PR</button>
        <div id="repo-pr-status" class="muted"></div>
      </div>
    </div>
  </section>`
}

export function buildRepositoryViewClientScript(): string {
  return `
    const repoState = { currentFilePath: null, currentBaseHash: null, currentBranch: null, sandboxRunners: [], currentSandboxExecutionId: null };

    const REPO_SANDBOX_LANGUAGE_BY_EXTENSION = {
      '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript', '.py': 'python', '.go': 'go',
      '.rs': 'rust', '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp',
      '.cxx': 'cpp', '.rb': 'ruby', '.php': 'php'
    };

    function repoAuthHeaders(extra) {
      return Object.assign({ authorization: 'Bearer ' + appState.codemindKey }, extra || {});
    }

    function repoFetchJson(url, options) {
      return fetch(url, Object.assign({}, options, { headers: repoAuthHeaders((options && options.headers) || {}) }))
        .then(function (response) {
          return response.json().then(function (body) { return { status: response.status, body: body }; });
        });
    }

    function repoSandboxLanguageForPath(filePath) {
      const dot = filePath.lastIndexOf('.');
      if (dot < 0) return null;
      return REPO_SANDBOX_LANGUAGE_BY_EXTENSION[filePath.slice(dot)] || null;
    }

    function repoSandboxArgs() {
      const raw = document.getElementById('repo-sandbox-args').value.trim();
      return raw ? raw.split(/\s+/) : [];
    }

    function repoSandboxCompatibleRunner(languageId) {
      return repoState.sandboxRunners.find(function (runner) {
        return runner.languageIds.indexOf(languageId) >= 0 && runner.availability.status === 'available' && runner.backend !== 'browser';
      }) || null;
    }

    function renderRepoSandboxInventory() {
      const select = document.getElementById('repo-sandbox-runner');
      const runBtn = document.getElementById('repo-sandbox-run-btn');
      const statusEl = document.getElementById('repo-sandbox-status');
      const languageId = repoState.currentFilePath ? repoSandboxLanguageForPath(repoState.currentFilePath) : null;
      const runners = languageId ? repoState.sandboxRunners.filter(function (runner) {
        return runner.languageIds.indexOf(languageId) >= 0;
      }) : [];
      select.innerHTML = runners.map(function (runner) {
        const label = runner.id + ' — ' + runner.backend + '/' + runner.trustClass + ' — ' + runner.availability.status;
        return '<option value="' + appEscapeHtml(runner.id) + '">' + appEscapeHtml(label) + '</option>';
      }).join('');
      const compatible = languageId ? repoSandboxCompatibleRunner(languageId) : null;
      if (compatible) select.value = compatible.id;
      runBtn.disabled = !repoState.currentFilePath || compatible === null;
      if (!repoState.currentFilePath) statusEl.textContent = 'Open a supported file to run it.';
      else if (!languageId) statusEl.textContent = 'No server sandbox language is recognized for this file extension.';
      else if (compatible === null) statusEl.textContent = languageId + ' has no available server runner. Enable CODEMIND_ALLOW_GUARDED_HOST_EXECUTION=true or prepare an approved container image.';
      else statusEl.textContent = 'Ready: ' + languageId + ' via ' + compatible.id + ' (' + compatible.backend + ', ' + compatible.trustClass + ').';
    }

    async function loadRepoSandboxRuntimes() {
      const result = await repoFetchJson('/api/sandbox/runtimes/refresh', { method: 'POST' });
      if (result.status !== 200) {
        document.getElementById('repo-sandbox-status').textContent = 'Runtime inventory failed: ' + (result.body.error || result.status);
        return;
      }
      repoState.sandboxRunners = result.body.runners || [];
      renderRepoSandboxInventory();
    }

    function renderRepoSandboxResult(result) {
      const lines = [
        'Status: ' + result.status,
        'Verification: ' + result.evidence.verificationLevel,
        'Runner: ' + result.runnerId,
        'Backend: ' + result.backend,
        'Isolation: ' + result.trustClass,
        'Duration: ' + result.durationMs + 'ms',
        'Exit code: ' + (result.exitCode === undefined ? '(none)' : result.exitCode),
        'Output truncated: ' + result.outputTruncated,
        'Cleanup: ' + result.cleanup.attempted + '/' + result.cleanup.succeeded,
        '',
        'STDOUT:',
        result.stdout || '(empty)',
        '',
        'STDERR:',
        result.stderr || '(empty)',
        '',
        'Diagnostics:',
        result.diagnostics.length === 0 ? '- none' : result.diagnostics.map(function (diagnostic) { return '- ' + diagnostic.severity + ': ' + diagnostic.message; }).join('\n')
      ];
      document.getElementById('repo-sandbox-result').textContent = lines.join('\n');
    }

    async function runRepoSandbox() {
      if (!repoState.currentFilePath) return;
      const languageId = repoSandboxLanguageForPath(repoState.currentFilePath);
      if (!languageId) return;
      const runnerId = document.getElementById('repo-sandbox-runner').value;
      const mode = document.getElementById('repo-sandbox-mode').value;
      const statusEl = document.getElementById('repo-sandbox-status');
      const runBtn = document.getElementById('repo-sandbox-run-btn');
      const cancelBtn = document.getElementById('repo-sandbox-cancel-btn');
      statusEl.textContent = 'Running sandbox execution...';
      runBtn.disabled = true;
      cancelBtn.disabled = false;
      const payload = {
        languageId: languageId,
        mode: mode,
        repository: { rootPath: '.', selectedPaths: [repoState.currentFilePath] },
        requestedRunnerId: runnerId,
        stdin: document.getElementById('repo-sandbox-stdin').value,
        args: repoSandboxArgs(),
        runtimeMode: 'APPROVED_EXECUTION'
      };
      if (appState.activeMissionId) payload.missionId = appState.activeMissionId;
      const result = await repoFetchJson('/api/sandbox/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = result.body.result;
      if (result.status !== 200 || !body) {
        statusEl.textContent = 'Sandbox failed: ' + (result.body.error || result.status);
      } else {
        repoState.currentSandboxExecutionId = body.executionId;
        statusEl.textContent = 'Sandbox execution ' + body.status + ' in ' + body.durationMs + 'ms.';
        renderRepoSandboxResult(body);
      }
      runBtn.disabled = false;
      cancelBtn.disabled = true;
    }

    async function cancelRepoSandbox() {
      if (!repoState.currentSandboxExecutionId) return;
      const result = await repoFetchJson('/api/sandbox/cancel/' + encodeURIComponent(repoState.currentSandboxExecutionId), { method: 'POST' });
      document.getElementById('repo-sandbox-status').textContent = result.status === 200 || result.status === 202
        ? 'Cancellation: ' + result.body.status
        : 'Cancellation failed: ' + (result.body.error || result.status);
    }

    function renderRepoTreeEntries(container, entries, parentPath) {
      const list = document.createElement('ul');
      list.className = 'repo-tree-list';
      entries.forEach(function (entry) {
        const item = document.createElement('li');
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'repo-tree-entry ' + entry.type;
        label.textContent = (entry.type === 'directory' ? '▸ ' : '') + entry.name;
        item.appendChild(label);

        if (entry.type === 'directory') {
          let expanded = false;
          let childContainer = null;
          label.addEventListener('click', function () {
            if (expanded) {
              if (childContainer) childContainer.style.display = 'none';
              label.textContent = '▸ ' + entry.name;
              expanded = false;
              return;
            }
            if (childContainer) {
              childContainer.style.display = 'block';
              label.textContent = '▾ ' + entry.name;
              expanded = true;
              return;
            }
            repoFetchJson('/api/repository/tree?dir=' + encodeURIComponent(entry.path)).then(function (result) {
              if (result.status !== 200) return;
              childContainer = document.createElement('div');
              childContainer.className = 'repo-tree-children';
              renderRepoTreeEntries(childContainer, result.body.entries, entry.path);
              item.appendChild(childContainer);
              label.textContent = '▾ ' + entry.name;
              expanded = true;
            });
          });
        } else {
          label.addEventListener('click', function () { openRepoFile(entry.path); });
        }

        list.appendChild(item);
      });
      container.innerHTML = '';
      container.appendChild(list);
    }

    async function loadRepoTree() {
      const result = await repoFetchJson('/api/repository/tree');
      if (result.status !== 200) return;
      renderRepoTreeEntries(document.getElementById('repo-tree'), result.body.entries, '');
    }

    async function openRepoFile(path) {
      const result = await repoFetchJson('/api/repository/file?path=' + encodeURIComponent(path));
      const editor = document.getElementById('repo-editor');
      const pathEl = document.getElementById('repo-file-path');
      const saveBtn = document.getElementById('repo-save-btn');
      if (result.status !== 200) {
        pathEl.textContent = 'Failed to open ' + path + ': ' + (result.body.error || result.status);
        return;
      }
      repoState.currentFilePath = path;
      repoState.currentBaseHash = result.body.contentHash;
      editor.value = result.body.content;
      editor.disabled = false;
      saveBtn.disabled = false;
      pathEl.textContent = path;
      document.getElementById('repo-save-status').textContent = '';
      renderRepoSandboxInventory();
    }

    async function saveRepoFile() {
      if (!repoState.currentFilePath) return;
      const statusEl = document.getElementById('repo-save-status');
      const content = document.getElementById('repo-editor').value;
      statusEl.textContent = 'Saving...';

      const result = await repoFetchJson('/api/repository/file', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: repoState.currentFilePath, content: content, baseContentHash: repoState.currentBaseHash }),
      });

      if (result.status === 409) {
        const overwrite = window.confirm(
          repoState.currentFilePath + ' changed on disk since it was loaded.\n\nOK to overwrite the on-disk version with your changes, Cancel to reload the on-disk version instead.'
        );
        if (overwrite) {
          const forced = await repoFetchJson('/api/repository/file', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: repoState.currentFilePath, content: content }),
          });
          if (forced.status === 200) {
            repoState.currentBaseHash = forced.body.contentHash;
            statusEl.textContent = 'Saved (overwrote external change) at ' + new Date().toLocaleTimeString();
            loadRepoStatus();
          } else {
            statusEl.textContent = 'Save failed: ' + (forced.body.error || forced.status);
          }
        } else {
          document.getElementById('repo-editor').value = result.body.currentContent || '';
          repoState.currentBaseHash = result.body.currentContentHash;
          statusEl.textContent = 'Reloaded the on-disk version. Your unsaved changes were discarded.';
        }
        return;
      }

      if (result.status !== 200) {
        statusEl.textContent = 'Save failed: ' + (result.body.error || result.status);
        return;
      }

      repoState.currentBaseHash = result.body.contentHash;
      statusEl.textContent = 'Saved at ' + new Date().toLocaleTimeString();
      loadRepoStatus();
    }

    async function loadRepoDiff(path, staged) {
      const result = await repoFetchJson('/api/repository/diff?path=' + encodeURIComponent(path) + '&staged=' + (staged ? 'true' : 'false'));
      const diffEl = document.getElementById('repo-diff-content');
      diffEl.textContent = result.status === 200 ? (result.body.diff || '(no textual diff -- binary or empty change)') : 'Failed to load diff: ' + (result.body.error || result.status);
    }

    function renderRepoChangeGroup(title, entries, staged) {
      if (entries.length === 0) return '';
      const rows = entries.map(function (entry) {
        return '<li><button type="button" class="repo-change-entry" data-path="' + appEscapeHtml(entry.path) + '" data-staged="' + (staged ? '1' : '0') + '">' + appEscapeHtml(entry.path) + '</button></li>';
      }).join('');
      return '<h4>' + title + '</h4><ul class="repo-change-list">' + rows + '</ul>';
    }

    async function loadRepoStatus() {
      const result = await repoFetchJson('/api/repository/status');
      const listEl = document.getElementById('repo-changes-list');
      const statusLineEl = document.getElementById('repo-status-line');
      if (result.status !== 200) {
        listEl.innerHTML = '<p class="muted">Failed to load status: ' + appEscapeHtml(result.body.error || String(result.status)) + '</p>';
        return;
      }
      repoState.currentBranch = result.body.currentBranch;
      statusLineEl.textContent = 'On branch ' + result.body.currentBranch + '.';
      const summary = result.body.summary;
      listEl.innerHTML =
        renderRepoChangeGroup('Staged', summary.staged, true) +
        renderRepoChangeGroup('Unstaged', summary.unstaged, false) +
        renderRepoChangeGroup('Untracked', summary.untracked, false) +
        renderRepoChangeGroup('Conflicted', summary.conflicted, false);

      if (summary.staged.length === 0 && summary.unstaged.length === 0 && summary.untracked.length === 0) {
        listEl.innerHTML = '<p class="muted">No changes.</p>';
      }

      listEl.querySelectorAll('.repo-change-entry').forEach(function (button) {
        button.addEventListener('click', function () {
          loadRepoDiff(button.getAttribute('data-path'), button.getAttribute('data-staged') === '1');
        });
      });
    }

    async function loadRepoBranches() {
      const result = await repoFetchJson('/api/repository/branches');
      if (result.status !== 200) return;
      const select = document.getElementById('repo-branch-select');
      select.innerHTML = result.body.branches.map(function (branch) {
        return '<option value="' + appEscapeHtml(branch) + '"' + (branch === result.body.current ? ' selected' : '') + '>' + appEscapeHtml(branch) + '</option>';
      }).join('');
    }

    async function createRepoBranch() {
      const name = window.prompt('New branch name:');
      if (!name) return;
      const result = await repoFetchJson('/api/repository/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name }),
      });
      if (result.status !== 200) {
        window.alert('Could not create branch: ' + (result.body.error || result.status));
        return;
      }
      await loadRepoBranches();
      await loadRepoStatus();
    }

    async function commitRepoChanges() {
      const messageEl = document.getElementById('repo-commit-message');
      const statusEl = document.getElementById('repo-commit-status');
      const message = messageEl.value.trim();
      if (!message) { statusEl.textContent = 'Enter a commit message first.'; return; }
      statusEl.textContent = 'Committing...';
      const result = await repoFetchJson('/api/repository/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: message }),
      });
      if (result.status !== 200) {
        statusEl.textContent = 'Commit failed: ' + (result.body.error || result.status);
        return;
      }
      statusEl.textContent = 'Committed.';
      messageEl.value = '';
      await loadRepoStatus();
    }

    async function pushRepoBranch() {
      const statusEl = document.getElementById('repo-push-status');
      const branch = repoState.currentBranch || '(current branch)';
      if (!window.confirm('Push ' + branch + ' to origin?')) return;
      statusEl.textContent = 'Pushing...';
      const result = await repoFetchJson('/api/repository/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      statusEl.textContent = result.status === 200
        ? 'Pushed ' + (result.body.branch || branch) + ' to ' + (result.body.remote || 'origin') + '.'
        : 'Push failed: ' + (result.body.error || result.status);
    }

    async function createRepoPullRequest() {
      const statusEl = document.getElementById('repo-pr-status');
      const title = document.getElementById('repo-pr-title').value.trim();
      const body = document.getElementById('repo-pr-body').value;
      const baseBranch = document.getElementById('repo-pr-base').value.trim() || 'main';
      const headBranch = document.getElementById('repo-pr-head').value.trim() || repoState.currentBranch;

      if (!title) { statusEl.textContent = 'Enter a title first.'; return; }
      if (!headBranch) { statusEl.textContent = 'No current branch detected -- enter a head branch.'; return; }
      if (!window.confirm('Create a draft pull request from ' + headBranch + ' into ' + baseBranch + '?')) return;

      statusEl.textContent = 'Creating pull request...';
      const result = await repoFetchJson('/api/repository/pull-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, title: title, body: body, baseBranch: baseBranch, headBranch: headBranch }),
      });

      if (result.status === 200 && result.body.outcome === 'CREATED') {
        statusEl.innerHTML = 'Created: <a href="' + appEscapeHtml(result.body.pullRequestUrl) + '" target="_blank" rel="noopener">' + appEscapeHtml(result.body.pullRequestUrl) + '</a>';
      } else {
        statusEl.textContent = 'Pull request failed: ' + (result.body.error || (result.body.blockReasons || []).join(' ') || result.status);
      }
    }

    document.getElementById('repo-save-btn').addEventListener('click', saveRepoFile);
    document.getElementById('repo-new-branch-btn').addEventListener('click', createRepoBranch);
    document.getElementById('repo-refresh-status-btn').addEventListener('click', loadRepoStatus);
    document.getElementById('repo-commit-btn').addEventListener('click', commitRepoChanges);
    document.getElementById('repo-push-btn').addEventListener('click', pushRepoBranch);
    document.getElementById('repo-pr-btn').addEventListener('click', createRepoPullRequest);
    document.getElementById('repo-sandbox-run-btn').addEventListener('click', runRepoSandbox);
    document.getElementById('repo-sandbox-cancel-btn').addEventListener('click', cancelRepoSandbox);

    let repoViewLoaded = false;
    registerRouterViewInit('repository', function () {
      if (!appState.codemindKey) {
        document.getElementById('repo-status-line').textContent = 'Connect with your CodeMind API key in Settings to open the repository.';
        return;
      }
      if (repoViewLoaded) return;
      repoViewLoaded = true;
      loadRepoTree();
      loadRepoBranches();
      loadRepoStatus();
      loadRepoSandboxRuntimes();
    });
  `
}
