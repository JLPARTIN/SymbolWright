/** The unified shell's `#/checkpoints` view — a browser for checkpoints created before mutating writes, with restore now that Large PR Bundle 2 gives it a real repository to restore into. */
export function renderCheckpointsViewHtml(): string {
  return `<section data-view="checkpoints" class="app-view" style="display:none">
    <h2>Checkpoints</h2>
    <p class="muted">Snapshots taken automatically before <code>edit_file</code>, <code>local_file_write</code>, and <code>apply_patch</code> mutate a file. Restore puts every snapshotted file in a checkpoint back to its pre-write content in the real working tree (hash-verified per file, never a blind reset).</p>
    <div id="checkpoints-status" class="muted">Connect with your CodeMind API key in Settings to load checkpoints.</div>
    <div id="checkpoints-content"></div>
  </section>`
}

export function buildCheckpointsViewClientScript(): string {
  return `
    async function restoreCheckpointById(checkpointId) {
      if (!window.confirm('Restore checkpoint ' + checkpointId + '? This overwrites the current content of every file in this checkpoint with its pre-write snapshot.')) return;
      try {
        const response = await fetch('/api/repository/checkpoints/' + encodeURIComponent(checkpointId) + '/restore', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + appState.codemindKey },
        });
        const data = await response.json();
        if (response.ok && data.status === 'restored') {
          window.alert('Restored ' + data.files.length + ' file(s).');
        } else {
          window.alert('Restore did not complete: ' + (data.status || response.status) + (data.reason ? ' -- ' + data.reason : ''));
        }
        loadCheckpointsView();
      } catch (error) {
        window.alert('Restore failed: ' + (error.message || String(error)));
      }
    }

    async function loadCheckpointsView() {
      const statusEl = document.getElementById('checkpoints-status');
      const contentEl = document.getElementById('checkpoints-content');
      if (!appState.codemindKey) {
        statusEl.textContent = 'Connect with your CodeMind API key in Settings to load checkpoints.';
        contentEl.innerHTML = '';
        return;
      }
      statusEl.textContent = 'Loading checkpoints...';
      try {
        const response = await fetch('/api/checkpoints', { headers: { authorization: 'Bearer ' + appState.codemindKey } });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        statusEl.textContent = data.checkpoints.length + ' checkpoint(s).';

        contentEl.innerHTML = data.checkpoints.length === 0 ? '<p class="muted">None yet — checkpoints appear here after an agent session or Repository-tab save mutates a file.</p>' :
          '<table><thead><tr><th>Checkpoint</th><th>Session</th><th>Tool</th><th>Files</th><th>Created</th><th></th></tr></thead><tbody>' +
          data.checkpoints.map((checkpoint) =>
            '<tr><td>' + appEscapeHtml(checkpoint.checkpointId) + '</td><td>' + appEscapeHtml(checkpoint.sessionId) + '</td><td>' + appEscapeHtml(checkpoint.tool) + '</td><td>' + checkpoint.fileCount + '</td><td>' + appEscapeHtml(checkpoint.createdAt) + '</td>' +
            '<td><button type="button" class="secondary" data-restore-checkpoint="' + appEscapeHtml(checkpoint.checkpointId) + '">Restore</button></td></tr>'
          ).join('') +
          '</tbody></table>';

        contentEl.querySelectorAll('[data-restore-checkpoint]').forEach((button) => {
          button.addEventListener('click', () => restoreCheckpointById(button.getAttribute('data-restore-checkpoint')));
        });
      } catch (error) {
        statusEl.textContent = 'Failed to load checkpoints: ' + (error.message || String(error));
      }
    }

    registerRouterViewInit('checkpoints', loadCheckpointsView);
  `
}
