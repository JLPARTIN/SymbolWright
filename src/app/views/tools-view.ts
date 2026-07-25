/** The unified shell's `#/tools` view — a read-only browser for the real 41-tool registry plus the 5 dynamically-wired tools. */
export function renderToolsViewHtml(): string {
  return `<section data-view="tools" class="app-view" style="display:none">
    <h2>Tool registry</h2>
    <p class="muted">The same static tool registry (<code>tool-assembly.ts</code>) and runtime-mode gating (<code>tool-schema-bridge.ts</code>) every SymbolWright entry point uses — CLI agent, HTTP agent, and MCP server.</p>
    <div id="tools-status" class="muted">Connect with your SymbolWright API key in Settings to load the tool registry.</div>
    <div id="tools-content"></div>
  </section>`
}

export function buildToolsViewClientScript(): string {
  return `
    async function loadToolsView() {
      const statusEl = document.getElementById('tools-status');
      const contentEl = document.getElementById('tools-content');
      if (!appState.symbolWrightKey) {
        statusEl.textContent = 'Connect with your SymbolWright API key in Settings to load the tool registry.';
        contentEl.innerHTML = '';
        return;
      }
      statusEl.textContent = 'Loading tool registry...';
      try {
        const response = await fetch('/api/tools', { headers: { authorization: 'Bearer ' + appState.symbolWrightKey } });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        statusEl.textContent = data.staticTools.length + ' statically-wired tools, ' + data.dynamicTools.length + ' dynamically-wired tools.';

        const rows = data.staticTools.map((tool) => {
          const reachability = Object.keys(data.modes).map((mode) =>
            '<span class="tool-mode-badge ' + (data.modes[mode].includes(tool.name) ? 'ok' : '') + '">' + appEscapeHtml(mode) + '</span>'
          ).join(' ');
          return '<tr><td>' + appEscapeHtml(tool.name) + '</td><td>' + appEscapeHtml(tool.capability) + '</td><td>' + appEscapeHtml(tool.description) + '</td><td>' + reachability + '</td></tr>';
        }).join('');

        const dynamicRows = data.dynamicTools.map((tool) =>
          '<tr><td>' + appEscapeHtml(tool.name) + '</td><td colspan="3" class="muted">Dynamically wired at runtime activation — not part of the static registry.</td></tr>'
        ).join('');

        contentEl.innerHTML =
          '<table><thead><tr><th>Name</th><th>Capability</th><th>Description</th><th>Reachable in mode</th></tr></thead>' +
          '<tbody>' + rows + dynamicRows + '</tbody></table>';
      } catch (error) {
        statusEl.textContent = 'Failed to load tool registry: ' + (error.message || String(error));
      }
    }

    registerRouterViewInit('tools', loadToolsView);
  `
}
