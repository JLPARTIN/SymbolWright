# Running CodeMind in GitHub Codespaces

CodeMind ships two separate local servers, both plain Node processes started
by the npm scripts in `package.json`:

| Server | Command | Port | What it is |
| --- | --- | --- | --- |
| Runtime preview / Get Started dashboard | `npm run dev` | `3005` | Real, local, deterministic diagnostics (`npm run doctor` + `npm run release-readiness`). No provider API key needed. Links you to the chat server below. |
| Chat + agent server | `npm run serve` | `8787` | The interactive browser chat UI (`codemind serve`). Lets you pick **Browser-only mode** (no provider key, local diagnostics only) or **API-backed mode** (bring your own provider key, real chat + agent tool execution). |

They are kept as two processes on purpose: the dashboard never needs any
secret, so you can preview it with zero setup, while the chat server only
starts once you've set a `CODEMIND_API_KEY` (see below).

## 1. Install and build

```bash
set -euo pipefail

echo "==> Node / npm versions"
node -v
npm -v

echo "==> Install dependencies"
npm ci
```

## 2. Typecheck / lint / test / build

```bash
set -euo pipefail

npm run typecheck --if-present
npm run lint --if-present
npm test --if-present
npm run build --if-present
```

## 3. Start the servers

**Terminal 1 — Get Started dashboard (no API key required):**

```bash
npm run dev
```

Open port `3005` (see "Opening a forwarded port" below). This page is real,
local, and deterministic: it shows live `doctor`/`release-readiness` output
and a link to the chat server.

**Terminal 2 — Chat + agent UI:**

```bash
export CODEMIND_API_KEY=$(openssl rand -hex 16)
npm run serve
```

Open port `8787`. In the browser:

1. Paste the `CODEMIND_API_KEY` value you just generated into "CodeMind
   access key" and click **Connect** (or press Enter).
2. Choose **Browser-only mode** to keep going with no provider key (local
   diagnostics only, chat/agent disabled), or **API-backed mode** to add a
   provider.
3. In API-backed mode, set at least one provider credential first (see
   [`docs/PROVIDER_KEYS.md`](PROVIDER_KEYS.md) for the full list), e.g.:

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

   then restart `npm run serve` in Terminal 2 so the server can see it, pick
   the provider in the dropdown, and click **Save and activate** (or press
   Enter in the provider API key field). The UI reports **active** or
   **invalid config** immediately — it never silently accepts a bad key.

## 4. Opening a forwarded port in Codespaces

- Open the **Ports** tab (bottom panel, next to Terminal).
- Find port `3005` (dashboard) or `8787` (chat), right-click it, and set
  **Port Visibility** to **Public** if you want to open it from a phone or a
  browser outside this Codespace. Otherwise the default **Private**
  visibility works fine from your own logged-in browser.
- Click the **Open in Browser** (globe) icon, or copy the forwarded URL —
  it looks like `https://<codespace-name>-<port>.app.github.dev`.
- On localhost (outside Codespaces) just use `http://localhost:3005` and
  `http://localhost:8787`.

## 5. Troubleshooting port conflicts

Find and stop whatever is already using CodeMind's ports instead of killing
all Node processes:

```bash
# Example only: replace ports with the actual app ports (3005, 8787)
lsof -ti tcp:3005 | xargs -r kill
lsof -ti tcp:8787 | xargs -r kill
```

If `lsof` isn't installed, use `fuser -k 3005/tcp` / `fuser -k 8787/tcp` as
a fallback. Avoid broad commands like `pkill node` — they will also kill
unrelated Node processes (editors, extensions, other terminals).

You can also run either server on a different port:

```bash
PORT=3006 npm run dev
CODEMIND_CHAT_PORT=8788 npm run serve
```
