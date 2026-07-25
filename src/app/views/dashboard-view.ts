/**
 * The unified shell's default (`#/dashboard`) view. Reuses the real,
 * deterministic `/api/status` diagnostics content that used to be the
 * dashboard server's standalone landing page (`src/web/server.ts`), minus
 * the cross-port "open SymbolWright Chat" link — the Agent view is now just
 * another tab in this same app, not a separate server to link out to.
 */
export function renderDashboardViewHtml(): string {
  return `<section data-view="dashboard" class="app-view">
    <h1>SymbolWright</h1>
    <p class="muted">Real, local, deterministic diagnostics (<code>npm run doctor</code> + <code>npm run release-readiness</code>). No AI provider is required for anything on this page.</p>
    <button type="button" onclick="loadDashboardStatus()">Refresh live status</button>
    <button type="button" class="secondary" onclick="navigateTo('workspace')">Open Workspace →</button>
    <button type="button" class="secondary" onclick="navigateTo('agent')">Open Agent →</button>

    <section id="dashboard-status" class="muted">Loading SymbolWright runtime status...</section>
  </section>`
}

export function buildDashboardClientScript(): string {
  return `
    async function loadDashboardStatus() {
      const statusEl = document.getElementById('dashboard-status');
      statusEl.textContent = 'Loading SymbolWright runtime status...';

      try {
        const response = await fetch('/api/status', {
          cache: 'no-store',
          headers: appState.symbolWrightKey ? { authorization: 'Bearer ' + appState.symbolWrightKey } : {},
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();

        const cards = data.cards.map((card) =>
          '<article class="card">' +
          '<div class="label">' + appEscapeHtml(card.label) + '</div>' +
          '<div class="value ' + appEscapeHtml(card.state) + '">' + appEscapeHtml(card.value) + '</div>' +
          '</article>'
        ).join('');

        statusEl.innerHTML =
          '<h2>Overall: <span class="' + appEscapeHtml(data.overallState) + '">' + appEscapeHtml(data.overallState).toUpperCase() + '</span></h2>' +
          '<p class="muted">Generated at ' + appEscapeHtml(data.generatedAt) + '</p>' +
          '<div class="grid">' + cards + '</div>';
      } catch (error) {
        statusEl.innerHTML = '<p class="muted">Connect with your SymbolWright API key in Settings to load detailed status, or ' +
          appEscapeHtml(error.message || String(error)) + '</p>';
      }
    }

    registerRouterViewInit('dashboard', loadDashboardStatus);
  `
}
