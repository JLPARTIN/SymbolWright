/** The unified shell's `#/memory` view — a read-only browser for episodic and procedural memory. */
export function renderMemoryViewHtml(): string {
  return `<section data-view="memory" class="app-view" style="display:none">
    <h2>Memory</h2>
    <p class="muted">Read-only view of this workspace's local memory database (<code>.codemind/memory/</code>). No write actions here — memory is learned during real agent sessions.</p>
    <div id="memory-status" class="muted">Connect with your CodeMind API key in Settings to load memory.</div>
    <div id="memory-episodic"></div>
    <div id="memory-procedural"></div>
  </section>`
}

export function buildMemoryViewClientScript(): string {
  return `
    async function loadMemoryView() {
      const statusEl = document.getElementById('memory-status');
      const episodicEl = document.getElementById('memory-episodic');
      const proceduralEl = document.getElementById('memory-procedural');
      if (!appState.codemindKey) {
        statusEl.textContent = 'Connect with your CodeMind API key in Settings to load memory.';
        episodicEl.innerHTML = '';
        proceduralEl.innerHTML = '';
        return;
      }
      statusEl.textContent = 'Loading memory...';
      try {
        const headers = { authorization: 'Bearer ' + appState.codemindKey };
        const [recentResponse, proceduralResponse] = await Promise.all([
          fetch('/api/memory/recent', { headers }),
          fetch('/api/memory/procedural', { headers }),
        ]);
        if (!recentResponse.ok) throw new Error('HTTP ' + recentResponse.status);
        if (!proceduralResponse.ok) throw new Error('HTTP ' + proceduralResponse.status);
        const recent = await recentResponse.json();
        const procedural = await proceduralResponse.json();

        statusEl.textContent = recent.note || (recent.interactions.length + ' recent episodic interaction(s).');

        episodicEl.innerHTML = '<h3>Recent episodic interactions</h3>' +
          (recent.interactions.length === 0 ? '<p class="muted">None yet.</p>' :
            '<table><thead><tr><th>Type</th><th>Content</th><th>Relevance</th></tr></thead><tbody>' +
            recent.interactions.map((entry) => '<tr><td>' + appEscapeHtml(entry.type) + '</td><td>' + appEscapeHtml(entry.content) + '</td><td>' + appEscapeHtml(entry.relevanceScore) + '</td></tr>').join('') +
            '</tbody></table>');

        proceduralEl.innerHTML = '<h3>Procedural rules</h3>' +
          procedural.categories.map((category) =>
            '<h4>' + appEscapeHtml(category.category) + '</h4>' +
            (category.rules.length === 0 ? '<p class="muted">None yet.</p>' : '<ul>' + category.rules.map((rule) => '<li>' + appEscapeHtml(rule) + '</li>').join('') + '</ul>')
          ).join('');
      } catch (error) {
        statusEl.textContent = 'Failed to load memory: ' + (error.message || String(error));
      }
    }

    registerRouterViewInit('memory', loadMemoryView);
  `
}
