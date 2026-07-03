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
    #chat-input-row { display: flex; gap: 8px; }
    #chat-input { flex: 1; resize: vertical; min-height: 44px; }
    .hint { font-size: 11px; color: #57649a; }
    .ok { color: #8ff0b7; }
    .fail { color: #ff8f8f; }
  </style>
</head>
<body>
  <main>
    <h1>CodeMind Chat</h1>
    <p class="sub">Bring your own provider API key. CodeMind routes the request through its provider gateway &mdash; your provider key never leaves the server.</p>

    <section id="connect-section">
      <h2>1. Connect to this CodeMind server</h2>
      <label for="codemind-key">CodeMind access key (CODEMIND_API_KEY)</label>
      <input id="codemind-key" type="password" placeholder="paste your CodeMind API key" autocomplete="off" />
      <button id="connect-btn">Connect</button>
      <div id="connect-status" class="hint"></div>
    </section>

    <section id="provider-section" style="display:none">
      <h2>2. Choose or register a provider</h2>
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
      <button id="save-provider-btn">Save provider</button>
      <button id="test-provider-btn" class="secondary">Test connection</button>
      <div id="provider-status" class="hint"></div>
    </section>

    <section id="chat-section" style="display:none">
      <h2>3. Chat</h2>
      <div id="transcript"></div>
      <div id="chat-input-row">
        <textarea id="chat-input" placeholder="Message your provider... (Enter to send, Shift+Enter for newline)"></textarea>
        <button id="send-btn">Send</button>
      </div>
      <div id="status-line"></div>
    </section>
  </main>

  <script>
    const state = { codemindKey: localStorage.getItem('codemind_api_key') || '', providerId: null, messages: [] };

    const el = (id) => document.getElementById(id);

    function authHeaders(extra) {
      return Object.assign({ authorization: 'Bearer ' + state.codemindKey }, extra || {});
    }

    function setText(id, text, cls) {
      const node = el(id);
      node.textContent = text;
      if (cls) node.className = 'hint ' + cls;
    }

    async function loadProviders() {
      const response = await fetch('/api/providers', { headers: authHeaders() });
      if (response.status === 401) throw new Error('Invalid CodeMind API key');
      if (!response.ok) throw new Error('Failed to load providers: HTTP ' + response.status);
      return response.json();
    }

    function renderProviderOptions(data) {
      const select = el('provider-select');
      select.innerHTML = '';
      for (const entry of data.catalog) {
        const option = document.createElement('option');
        option.value = entry.id;
        const status = data.statuses.find((s) => s.providerId === entry.id);
        option.textContent = entry.displayName + (status ? ' (' + status.status + ')' : '');
        select.appendChild(option);
      }
      select.value = data.redactedConfig.activeProvider || 'anthropic';
      onProviderChange();
    }

    function onProviderChange() {
      const providerId = el('provider-select').value;
      el('custom-fields').style.display = providerId === 'custom' ? 'block' : 'none';
    }

    el('provider-select')?.addEventListener?.('change', onProviderChange);

    el('connect-btn').addEventListener('click', async () => {
      const key = el('codemind-key').value.trim();
      if (!key) { setText('connect-status', 'Enter a CodeMind API key first.', 'fail'); return; }
      state.codemindKey = key;
      try {
        const data = await loadProviders();
        localStorage.setItem('codemind_api_key', key);
        setText('connect-status', 'Connected.', 'ok');
        renderProviderOptions(data);
        el('provider-section').style.display = 'block';
        el('chat-section').style.display = 'block';
      } catch (error) {
        setText('connect-status', error.message, 'fail');
      }
    });

    el('save-provider-btn').addEventListener('click', async () => {
      const providerId = el('provider-select').value;
      const body = { providerId };
      const apiKey = el('api-key-field').value.trim();
      const model = el('model-field').value.trim();
      const baseUrl = el('base-url-field').value.trim();
      if (apiKey) body.apiKey = apiKey;
      if (model) body.model = model;
      if (baseUrl) body.baseUrl = baseUrl;

      try {
        const response = await fetch('/api/providers/register', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed to save provider');
        state.providerId = providerId;
        setText('provider-status', 'Saved. Provider selected for chat.', 'ok');
        el('api-key-field').value = '';
      } catch (error) {
        setText('provider-status', error.message, 'fail');
      }
    });

    el('test-provider-btn').addEventListener('click', async () => {
      const providerId = el('provider-select').value;
      setText('provider-status', 'Testing...', '');
      try {
        const response = await fetch('/api/providers/test', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ providerId }),
        });
        const data = await response.json();
        setText('provider-status', data.ok ? ('OK: ' + data.detail) : ('Failed: ' + data.detail), data.ok ? 'ok' : 'fail');
      } catch (error) {
        setText('provider-status', error.message, 'fail');
      }
    });

    function appendMessage(role, text) {
      const bubble = document.createElement('div');
      bubble.className = 'msg ' + role;
      bubble.textContent = text;
      el('transcript').appendChild(bubble);
      el('transcript').scrollTop = el('transcript').scrollHeight;
      return bubble;
    }

    async function sendMessage() {
      const input = el('chat-input');
      const text = input.value.trim();
      if (!text) return;
      const providerId = el('provider-select').value;

      input.value = '';
      state.messages.push({ role: 'user', content: text });
      appendMessage('user', text);
      const assistantBubble = appendMessage('assistant', '');
      el('send-btn').disabled = true;
      setText('status-line', 'Sending...', '');

      try {
        const model = el('model-field').value.trim();
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            providerId,
            ...(model ? { model } : {}),
            stream: true,
            messages: state.messages,
          }),
        });

        if (!response.ok || response.body === null) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || ('HTTP ' + response.status));
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf('\\n\\n');
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\\n\\n');

            const lines = frame.split('\\n');
            let eventType = 'message';
            let dataLine = '';
            for (const line of lines) {
              if (line.startsWith('event:')) eventType = line.slice(6).trim();
              if (line.startsWith('data:')) dataLine = line.slice(5).trim();
            }
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine);
            if (eventType === 'error') {
              assistantText += '\\n[error: ' + (payload.message || 'unknown error') + ']';
              assistantBubble.textContent = assistantText;
              assistantBubble.className = 'msg error';
            } else if (eventType === 'done') {
              // stream complete
            } else if (typeof payload.delta === 'string') {
              assistantText += payload.delta;
              assistantBubble.textContent = assistantText;
            }
          }
        }

        state.messages.push({ role: 'assistant', content: assistantText });
        setText('status-line', '', '');
      } catch (error) {
        assistantBubble.textContent = 'Error: ' + error.message;
        assistantBubble.className = 'msg error';
        setText('status-line', '', '');
      } finally {
        el('send-btn').disabled = false;
      }
    }

    el('send-btn').addEventListener('click', sendMessage);
    el('chat-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    if (state.codemindKey) {
      el('codemind-key').value = state.codemindKey;
      el('connect-btn').click();
    }
  </script>
</body>
</html>`
}
