/** The unified shell's `#/settings` view for the shared Codetelligence access key. */
export function renderSettingsViewHtml(): string {
  return `<section data-view="settings" class="app-view" style="display:none">
    <h2>Settings</h2>
    <label for="settings-codetelligence-key">Codetelligence access key (CODETELLIGENCE_API_KEY)</label>
    <input id="settings-codetelligence-key" type="password" placeholder="paste your Codetelligence access key" autocomplete="off" />
    <button type="button" onclick="saveSettingsCodetelligenceKey()">Save key</button>
    <button type="button" class="secondary" onclick="clearSettingsCodetelligenceKey()">Clear key</button>
    <div id="settings-status" class="muted"></div>
    <p class="muted">This key is stored in this browser's local storage and gates every authenticated Codetelligence API (Status, Tools, Memory, Checkpoints, Providers, Chat, Agent). Existing CodeMind browser keys are imported automatically. Do not use it on a shared or public computer — clear it when you're done.</p>

    <h3>Scratch Workspace</h3>
    <p class="muted">The Workspace editor persists scratch sessions only in this browser's local storage. Use the Repository tab for the checked-out working tree, diffs, commits, and pull requests.</p>
  </section>`
}

export function buildSettingsViewClientScript(): string {
  return `
    function saveSettingsCodetelligenceKey() {
      const value = document.getElementById('settings-codetelligence-key').value.trim();
      if (!value) {
        document.getElementById('settings-status').textContent = 'Enter a key first.';
        return;
      }
      localStorage.setItem('codetelligence_api_key', value);
      appState.set({ codetelligenceKey: value, codemindKey: value });
      document.getElementById('settings-status').textContent = 'Saved. Views will use this key immediately.';
    }

    function clearSettingsCodetelligenceKey() {
      localStorage.removeItem('codetelligence_api_key');
      localStorage.removeItem('codemind_api_key');
      appState.set({ codetelligenceKey: '', codemindKey: '' });
      document.getElementById('settings-codetelligence-key').value = '';
      document.getElementById('settings-status').textContent = 'Cleared.';
    }

    registerRouterViewInit('settings', function () {
      document.getElementById('settings-codetelligence-key').value =
        appState.codetelligenceKey || appState.codemindKey || '';
    });
  `
}
