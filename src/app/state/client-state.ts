/**
 * Builds the unified app shell's shared client-side state object. This
 * generalizes the two separate `state` objects that used to live inside
 * `universal-editor-html.ts` (`locale`, `lastIntelligenceDraft`) and
 * `chat-ui-html.ts` (`symbolWrightKey`, `mode`, `providerId`, `messages`,
 * `agentMessages`) into one object both the workspace view and the agent
 * view can read and write without a page navigation — the mechanism the
 * embedded workspace-to-agent handoff (`pendingAgentDraft`) relies on.
 *
 * localStorage keys read a `symbolwright_*` canonical entry first, falling
 * back to the legacy `symbolwright_*` entry so existing browsers don't lose a
 * stored API key, mode, or active mission across the rename. When a legacy
 * value is found and the canonical one is not yet set, it's written forward
 * once; the legacy entry itself is never deleted.
 */
export function buildClientStateScript(): string {
  return `
    function appEscapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function appReadMigratedStorageItem(canonicalKey, legacyKey) {
      if (typeof localStorage === 'undefined') return null;
      const canonicalValue = localStorage.getItem(canonicalKey);
      if (canonicalValue !== null) return canonicalValue;
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        localStorage.setItem(canonicalKey, legacyValue);
      }
      return legacyValue;
    }

    const appState = {
      symbolWrightKey: appReadMigratedStorageItem('symbolwright_api_key', 'codemind_api_key') || '',
      runtimeMode: appReadMigratedStorageItem('symbolwright_mode', 'codemind_mode') || 'browser',
      providerId: null,
      providerActive: false,
      pendingAgentDraft: null,
      activeMissionId: appReadMigratedStorageItem('symbolwright_active_mission_id', 'codemind_active_mission_id') || null,
      activeMission: null,
      activeMissionReadOnly: false,
      listeners: new Set(),
      subscribe(fn) {
        appState.listeners.add(fn);
        return () => appState.listeners.delete(fn);
      },
      set(patch) {
        Object.assign(appState, patch);
        appState.listeners.forEach((fn) => fn(appState));
      },
    };
  `
}
