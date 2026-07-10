import { buildChatTranscriptClientScript } from './chat-transcript-client-script.js'

export function renderChatUiHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CodeMind Chat</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0b1020; color: #e8ecff; }
    main { max-width: 880px; margin: 0 auto; padding: 24px 16px 80px; }
    h1 { font-size: 26px; margin: 0 0 4px; }
    .sub { color: #8ea0d7; margin: 0 0 20px; font-size: 13px; }
    section { border: 1px solid #2a355f; border-radius: 14px; background: #111832; padding: 16px; margin-bottom: 16px; }
    section h2 { margin: 0 0 10px; font-size: 15px; color: #cdd7ff; }
    label { display: block; font-size: 12px; color: #8ea0d7; margin: 8px 0 4px; }
    input, select, textarea { width: 100%; box-sizing: border-box; background: #080c18; color: #e8ecff; border: 1px solid #2a355f; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; }
    button { background: #3a5bff; color: white; border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; margin-top: 8px; margin-right: 6px; }
    button.secondary { background: #232c50; }
    button.active { outline: 2px solid #8ff0b7; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .row { display: flex; gap: 10px; }
    .row > div { flex: 1; }
    #custom-fields { display: none; }
    #status-line { font-size: 12px; color: #8ea0d7; margin-top: 8px; min-height: 16px; }
    #transcript { display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; margin-bottom: 10px; }
    .msg { padding: 10px 12px; border-radius: 10px; white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.5; }
    .msg.user { background: #1c2650; align-self: flex-end; max-width: 80%; }
    .msg.assistant { background: #16203f; align-self: flex-start; max-width: 80%; border: 1px solid #2a355f; }
    .msg.error { background: #401d24; color: #ff9d9d; }
    .msg.tool { background: #10241a; border: 1px solid #1f4a34; color: #b9e6cb; align-self: flex-start; max-width: 90%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
    #chat-input-row { display: flex; gap: 8px; }
    #chat-input { flex: 1; resize: vertical; min-height: 44px; }
    .hint { font-size: 11px; color: #57649a; }
    .warn { color: #f5c451; }
    .ok { color: #8ff0b7; }
    .fail { color: #ff8f8f; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .checkbox-row input[type="checkbox"] { width: auto; }
    .checkbox-row label { margin: 0; font-size: 13px; color: #cdd7ff; }
    #agent-mode-controls { display: none; }
    #mode-section, #local-status-section, #provider-section, #chat-section { display: none; }
    .local-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 10px; }
    .local-status-card { border: 1px solid #2a355f; border-radius: 10px; padding: 10px; background: #0c1226; }
    .local-status-card .label { font-size: 11px; color: #8ea0d7; margin-bottom: 4px; }
    .local-status-card .value { font-size: 14px; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>CodeMind Chat</h1>
    <p class="sub">Bring your own provider API key, stay in browser-only mode with no key at all, or open a structured draft from the Universal Workspace. CodeMind routes provider requests through its provider gateway &mdash; your provider key never leaves the server.</p>
    <p id="mode-status" class="sub"><strong>Current mode:</strong> not connected yet</p>

    <section id="connect-section" style="display:block">
      <h2>1. Connect to this CodeMind server</h2>
      <label for="codemind-key">CodeMind access key (CODEMIND_API_KEY)</label>
      <input id="codemind-key" type="password" placeholder="paste your CodeMind API key" autocomplete="off" />
      <button id="connect-btn">Connect</button>
      <div id="connect-status" class="hint"></div>
      <div class="hint warn">This key is saved in this browser's local storage so you don't have to retype it. Do not use that on a shared or public computer &mdash; clear it from browser storage when you're done.</div>
    </section>

    <section id="mode-section">
      <h2>2. Choose your mode</h2>
      <button id="browser-mode-btn" class="secondary">Browser-only mode &mdash; no API key</button>
      <button id="api-mode-btn" class="secondary">API-backed mode &mdash; bring your own key</button>
      <div class="hint">Browser-only mode runs CodeMind's local diagnostics (doctor + release-readiness) with no provider connected. Switch to API-backed mode any time to add a provider and chat.</div>
    </section>

    <section id="local-status-section">
      <h2>Browser-only mode &mdash; local diagnostics</h2>
      <p class="hint">Real, deterministic, local checks. No AI provider is connected in this mode, so chat and agent mode are unavailable until you switch to API-backed mode.</p>
      <button id="refresh-local-status-btn" class="secondary">Refresh local diagnostics</button>
      <div id="local-status-summary" class="hint">Loading local diagnostics...</div>
      <div id="local-status-grid" class="local-status-grid"></div>
    </section>

    <section id="provider-section">
      <h2>3. Choose or register a provider</h2>
      <div class="row">
        <div>
          <label for="provider-select">Provider</label>
          <select id="provider-select"></select>
        </div>
        <div>
          <label for="model-field">Model (optional, uses provider default)</label>
          <input id="model-field" type="text" placeholder="e.g. gpt-4o-mini" />
        </div>
      </div>
      <div id="custom-fields">
        <label for="base-url-field">API base URL</label>
        <input id="base-url-field" type="text" placeholder="https://your-api-host.example.com/v1" />
      </div>
      <label for="api-key-field">Provider API key (only sent to this server, stored server-side)</label>
      <input id="api-key-field" type="password" placeholder="provider API key" autocomplete="off" />
      <button id="save-provider-btn">Save and activate</button>
      <button id="test-provider-btn" class="secondary">Test connection</button>
      <div id="provider-status" class="hint"></div>
    </section>

    <section id="chat-section">
      <h2>4. Chat</h2>
      <div class="checkbox-row">
        <input type="checkbox" id="agent-mode-toggle" />
        <label for="agent-mode-toggle">Agent mode &mdash; let the model read/edit files and run commands via /api/agent</label>
      </div>
      <div id="agent-mode-controls">
        <label for="agent-mode-select">Runtime mode</label>
        <select id="agent-mode-select">
          <option value="READ_ONLY">READ_ONLY &mdash; read and search files only (default, safest)</option>
          <option value="PROPOSAL_ONLY">PROPOSAL_ONLY &mdash; + draft patches/notes, no writes</option>
          <option value="APPROVED_EXECUTION">APPROVED_EXECUTION &mdash; + edit files, run shell commands</option>
        </select>
        <div class="hint">Tool calls the model makes are shown inline below as they happen.</div>
      </div>
      <div id="transcript"></div>
      <div id="chat-input-row">
        <textarea id="chat-input" placeholder="Message your provider... (Enter to send, Shift+Enter for newline)"></textarea>
        <button id="send-btn">Send</button>
      </div>
      <div id="status-line"></div>
    </section>
  </main>

  <script>${buildChatTranscriptClientScript()}</script>
</body>
</html>`
}
