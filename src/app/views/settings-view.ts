/**
 * The unified shell's `#/settings` view — sets the shared SymbolWright API key
 * used by Dashboard/Tools/Memory/Checkpoints. The Agent view keeps its own
 * connect flow (it needs the "browser-only vs. API-backed" mode picker
 * alongside the key), but both write to the same `symbolwright_api_key`
 * localStorage entry, so a key entered in either place is picked up by the
 * other on next load.
 */
export function renderSettingsViewHtml(): string {
  return `<section data-view="settings" class="app-view" style="display:none">
    <h2>Settings</h2>
    <label for="settings-symbolwright-key">SymbolWright access key (SYMBOLWRIGHT_API_KEY)</label>
    <input id="settings-symbolwright-key" type="password" placeholder="paste your SymbolWright API key" autocomplete="off" />
    <button type="button" onclick="saveSettingsSymbolWrightKey()">Save key</button>
    <button type="button" class="secondary" onclick="clearSettingsSymbolWrightKey()">Clear key</button>
    <div id="settings-status" class="muted"></div>
    <p class="muted">This key is stored in this browser's local storage, the same entry the Agent view's connect flow uses. It gates every authenticated SymbolWright API (Status, Tools, Memory, Checkpoints, Providers, Chat, Agent). Do not use it on a shared or public computer — clear it when you're done.</p>

    <h3>Scratch Workspace</h3>
    <p class="muted">The Workspace tab's editor persists sessions only in this browser's local storage — it does not read or write the checked-out repository on disk. It is an intentionally separate scratch pad; for real repository-backed editing (the actual working tree, diffs, commits, PRs), use the Repository tab.</p>
  </section>`
}

export function buildSettingsViewClientScript(): string {
  return `
    function saveSettingsSymbolWrightKey() {
      const value = document.getElementById('settings-symbolwright-key').value.trim();
      if (!value) {
        document.getElementById('settings-status').textContent = 'Enter a key first.';
        return;
      }
      localStorage.setItem('symbolwright_api_key', value);
      appState.set({ symbolWrightKey: value });
      document.getElementById('settings-status').textContent = 'Saved. Views will use this key on next load or visit.';
    }

    function clearSettingsSymbolWrightKey() {
      localStorage.removeItem('symbolwright_api_key');
      localStorage.removeItem('codemind_api_key');
      appState.set({ symbolWrightKey: '' });
      document.getElementById('settings-symbolwright-key').value = '';
      document.getElementById('settings-status').textContent = 'Cleared.';
    }

    registerRouterViewInit('settings', function () {
      document.getElementById('settings-symbolwright-key').value = appState.symbolWrightKey || '';
    });
  `
}
