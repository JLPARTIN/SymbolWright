import { buildRepositoryMissionBridgeScript } from './repository-mission-bridge.js'

/**
 * Bridges the Workspace view's "AI task" buttons to the embedded Agent
 * view in-page, replacing the old separate-page `<a href>` handoff
 * (`?draft=...&agentMode=...` on a different port/page that the user had
 * to click, then manually connect and send).
 *
 * `workspace-client-script.ts`'s `showAiTask()` already checks for
 * `window.symbolWrightHandleWorkspaceDraft` and calls it instead of building a
 * link when it exists (added when that script was first extracted) — this
 * module is what defines it. The draft is written into the chat input and
 * the runtime mode is pre-selected, but nothing is auto-sent: the user
 * still reviews the draft and presses Send themselves, and still has to
 * connect a provider first if they haven't. `pendingAgentDraft` is only
 * cleared once it has actually been applied to the DOM, so revisiting the
 * Agent tab before finishing provider setup doesn't lose the draft.
 */
export function buildWorkspaceAgentBridgeScript(): string {
  return `
    window.symbolWrightHandleWorkspaceDraft = function (message, agentMode) {
      appState.set({ pendingAgentDraft: { message: message, agentMode: agentMode } });
      navigateTo('agent');
    };

    function applyPendingAgentDraftToAgentView() {
      if (!appState.pendingAgentDraft) return;
      const draft = appState.pendingAgentDraft;

      const input = document.getElementById('chat-input');
      if (input) input.value = draft.message;

      if (draft.agentMode === 'READ_ONLY' || draft.agentMode === 'PROPOSAL_ONLY' || draft.agentMode === 'APPROVED_EXECUTION') {
        const toggle = document.getElementById('agent-mode-toggle');
        const select = document.getElementById('agent-mode-select');
        const controls = document.getElementById('agent-mode-controls');
        if (toggle) toggle.checked = true;
        if (select) select.value = draft.agentMode;
        if (controls) controls.style.display = 'block';
      }

      const transcript = document.getElementById('transcript');
      if (transcript) {
        const bubble = document.createElement('div');
        bubble.className = 'msg tool';
        bubble.textContent = 'Loaded from Workspace. Review the draft, connect a provider if needed, then press Send.';
        transcript.appendChild(bubble);
        transcript.scrollTop = transcript.scrollHeight;
      }

      appState.set({ pendingAgentDraft: null });
    }

    registerRouterViewInit('agent', applyPendingAgentDraftToAgentView);

    (function applyBackwardCompatDraftUrl() {
      const params = new URLSearchParams(window.location.search);
      const draft = params.get('draft');
      const agentMode = params.get('agentMode');
      if (draft === null || draft.trim().length === 0) return;
      appState.set({ pendingAgentDraft: { message: draft, agentMode: agentMode } });
      navigateTo('agent');
    })();

    window.symbolWrightGetScratchMissionState = function () {
      const raw = localStorage.getItem('symbolwright.workspace.session.v1');
      if (!raw) return {};
      try { return JSON.parse(raw); }
      catch (_) { return {}; }
    };

    ${buildRepositoryMissionBridgeScript()}
  `
}
