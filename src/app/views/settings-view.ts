/**
 * The unified shell's `#/settings` view — sets the shared CodeMind API key
 * used by Dashboard/Tools/Memory/Checkpoints. The Agent view keeps its own
 * connect flow (it needs the "browser-only vs. API-backed" mode picker
 * alongside the key), but both write to the same `codemind_api_key`
 * localStorage entry, so a key entered in either place is picked up by the
 * other on next load.
 */
export function renderSettingsViewHtml(): string {
  return `<section data-view="settings" class="app-view" style="display:none">
    <h2>Settings</h2>
    <label for="settings-codemind-key">CodeMind access key (CODEMIND_API_KEY)</label>
    <input id="settings-codemind-key" type="password" placeholder="paste your CodeMind API key" autocomplete="off" />
    <button type="button" onclick="saveSettingsCodemindKey()">Save key</button>
    <button type="button" class="secondary" onclick="clearSettingsCodemindKey()">Clear key</button>
    <div id="settings-status" class="muted"></div>
    <p class="muted">This key is stored in this browser's local storage, the same entry the Agent view's connect flow uses. It gates every authenticated CodeMind API (Status, Tools, Memory, Checkpoints, Providers, Chat, Agent). Do not use it on a shared or public computer — clear it when you're done.</p>

    <h3>Scratch Workspace</h3>
    <p class="muted">The Workspace editor currently persists sessions only in this browser's local storage — it does not read or write the checked-out repository on disk. Real repository-backed editing (open the actual working tree, diffs, commits, PRs) is planned for Large PR Bundle 2.</p>
  </section>`
}

export function buildSettingsViewClientScript(): string {
  return `
    function saveSettingsCodemindKey() {
      const value = document.getElementById('settings-codemind-key').value.trim();
      if (!value) {
        document.getElementById('settings-status').textContent = 'Enter a key first.';
        return;
      }
      localStorage.setItem('codemind_api_key', value);
      appState.set({ codemindKey: value });
      document.getElementById('settings-status').textContent = 'Saved. Views will use this key on next load or visit.';
    }

    function clearSettingsCodemindKey() {
      localStorage.removeItem('codemind_api_key');
      appState.set({ codemindKey: '' });
      document.getElementById('settings-codemind-key').value = '';
      document.getElementById('settings-status').textContent = 'Cleared.';
    }

    registerRouterViewInit('settings', function () {
      document.getElementById('settings-codemind-key').value = appState.codemindKey || '';
    });
  `
}
