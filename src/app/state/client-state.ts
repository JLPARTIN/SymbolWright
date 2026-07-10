/**
 * Builds the unified app shell's shared client-side state object. This
 * generalizes the two separate `state` objects that used to live inside
 * `universal-editor-html.ts` (`locale`, `lastIntelligenceDraft`) and
 * `chat-ui-html.ts` (`codemindKey`, `mode`, `providerId`, `messages`,
 * `agentMessages`) into one object both the workspace view and the agent
 * view can read and write without a page navigation — the mechanism the
 * embedded workspace-to-agent handoff (`pendingAgentDraft`) relies on.
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

    const appState = {
      codemindKey: (typeof localStorage !== 'undefined' && localStorage.getItem('codemind_api_key')) || '',
      runtimeMode: (typeof localStorage !== 'undefined' && localStorage.getItem('codemind_mode')) || 'browser',
      providerId: null,
      providerActive: false,
      pendingAgentDraft: null,
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
