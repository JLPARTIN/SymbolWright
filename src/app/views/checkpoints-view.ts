/** The unified shell's `#/checkpoints` view — a read-only browser for checkpoints created before mutating writes. */
export function renderCheckpointsViewHtml(): string {
  return `<section data-view="checkpoints" class="app-view" style="display:none">
    <h2>Checkpoints</h2>
    <p class="muted">Snapshots taken automatically before <code>edit_file</code>, <code>local_file_write</code>, and <code>apply_patch</code> mutate a file. Restore is a write path and stays CLI-only: <code>codemind checkpoint restore &lt;id&gt;</code>.</p>
    <div id="checkpoints-status" class="muted">Connect with your CodeMind API key in Settings to load checkpoints.</div>
    <div id="checkpoints-content"></div>
  </section>`
}

export function buildCheckpointsViewClientScript(): string {
  return `
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

        contentEl.innerHTML = data.checkpoints.length === 0 ? '<p class="muted">None yet — checkpoints appear here after an agent session mutates a file.</p>' :
          '<table><thead><tr><th>Checkpoint</th><th>Session</th><th>Tool</th><th>Files</th><th>Created</th></tr></thead><tbody>' +
          data.checkpoints.map((checkpoint) =>
            '<tr><td>' + appEscapeHtml(checkpoint.checkpointId) + '</td><td>' + appEscapeHtml(checkpoint.sessionId) + '</td><td>' + appEscapeHtml(checkpoint.tool) + '</td><td>' + checkpoint.fileCount + '</td><td>' + appEscapeHtml(checkpoint.createdAt) + '</td></tr>'
          ).join('') +
          '</tbody></table>';
      } catch (error) {
        statusEl.textContent = 'Failed to load checkpoints: ' + (error.message || String(error));
      }
    }

    registerRouterViewInit('checkpoints', loadCheckpointsView);
  `
}
