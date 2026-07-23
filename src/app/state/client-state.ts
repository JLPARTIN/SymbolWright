/**
 * Builds the unified app shell's shared client-side state object. Canonical
 * browser persistence uses the `codetelligence_*` namespace. Legacy
 * `codemind_*` values are imported once on read so existing browser sessions
 * continue without forcing operators to reconnect or lose the active mission.
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

    function readCodetelligenceStorage(canonicalKey, legacyKey, fallbackValue) {
      if (typeof localStorage === 'undefined') return fallbackValue;
      const canonicalValue = localStorage.getItem(canonicalKey);
      if (canonicalValue !== null) return canonicalValue;
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        localStorage.setItem(canonicalKey, legacyValue);
        return legacyValue;
      }
      return fallbackValue;
    }

    const initialCodetelligenceKey = readCodetelligenceStorage(
      'codetelligence_api_key',
      'codemind_api_key',
      '',
    );

    const appState = {
      codetelligenceKey: initialCodetelligenceKey,
      codemindKey: initialCodetelligenceKey,
      runtimeMode: readCodetelligenceStorage('codetelligence_mode', 'codemind_mode', 'browser'),
      providerId: null,
      providerActive: false,
      pendingAgentDraft: null,
      activeMissionId: readCodetelligenceStorage(
        'codetelligence_active_mission_id',
        'codemind_active_mission_id',
        null,
      ),
      activeMission: null,
      activeMissionReadOnly: false,
      listeners: new Set(),
      subscribe(fn) {
        appState.listeners.add(fn);
        return () => appState.listeners.delete(fn);
      },
      set(patch) {
        if (Object.prototype.hasOwnProperty.call(patch, 'codetelligenceKey')) {
          patch.codemindKey = patch.codetelligenceKey;
        } else if (Object.prototype.hasOwnProperty.call(patch, 'codemindKey')) {
          patch.codetelligenceKey = patch.codemindKey;
        }
        Object.assign(appState, patch);
        appState.listeners.forEach((fn) => fn(appState));
      },
    };
  `
}
