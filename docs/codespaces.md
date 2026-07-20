# Running CodeMind in GitHub Codespaces

CodeMind ships as **one server, one port**, started by `npm run serve`
(`codemind serve` under the hood). It serves a single application shell with
persistent navigation across a Dashboard, the Universal Polyglot Workspace
(browser-local scratch editor), a real **Repository** tab (browses and edits
the actual checked-out working tree, with git status/diffs, branches,
commits, push, and PR creation — see
[`repository-workspace.md`](repository-workspace.md)), an embedded Agent
chat/tool-execution panel, and Tools/Memory/Checkpoints browsers — no
separate dashboard process and no separate chat server to juggle.

| Command | Port | What it is |
| --- | --- | --- |
| `npm run serve` (or `npm run dev`) | `8787` | The unified CodeMind app: Dashboard, Workspace, Repository, Agent, Tools, Memory, Checkpoints, and Settings, all as tabs in one page. Requires `CODEMIND_API_KEY` to start (see below) — the Workspace editor and code-run/code-intelligence routes work without a key, everything else (status, providers, chat, agent, tools, memory, checkpoints, repository) requires it. |

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

## 3. Fastest path to full access (one terminal)

If you already have a provider credential and just want everything working
&mdash; Workspace, Agent mode (`APPROVED_EXECUTION`: real file edits + shell
commands), and the dashboard &mdash; run all of this in one terminal before
starting the server, then open the forwarded port:

```bash
set -euo pipefail

export CODEMIND_API_KEY=$(openssl rand -hex 16)
export ANTHROPIC_API_KEY=sk-ant-...   # or any provider from docs/PROVIDER_KEYS.md

echo "CodeMind access key (paste this into the browser): $CODEMIND_API_KEY"
npm run serve
```

Then, on the forwarded/localhost port `8787`:

1. Open **Settings** and paste the printed `CODEMIND_API_KEY` into "CodeMind
   access key" (or use the Agent tab's own connect box — both write to the
   same browser-local key).
2. Open the **Agent** tab, pick your provider (it already shows
   **configured** since the env var was set before `npm run serve` started),
   and click **Test connection** to confirm **Active**.
3. Check **Agent mode**, set the runtime-mode dropdown to
   `APPROVED_EXECUTION`, and send a message &mdash; this is full access:
   the model can read/edit files and run shell commands in this workspace,
   shown inline as tool calls happen.
4. Open the **Workspace** tab, edit code, and use an AI task button
   ("Explain code", "Review for bugs", ...) &mdash; it switches straight to
   the Agent tab with the draft pre-filled, in the same page, no new tab.

Environment variables only apply to processes started *after* you export
them in that shell &mdash; if you add a provider key later, stop this
process (`Ctrl+C`) and re-run `npm run serve` in the same terminal.

## 4. Opening a forwarded port in Codespaces (localhost too)

- Open the **Ports** tab (bottom panel, next to Terminal).
- Find port `8787`, right-click it, and set **Port Visibility** to
  **Public** if you want to open it from a phone or a browser outside this
  Codespace. Otherwise the default **Private** visibility works fine from
  your own logged-in browser.
- Click the **Open in Browser** (globe) icon, or copy the forwarded URL —
  it looks like `https://<codespace-name>-8787.app.github.dev`.
- On localhost (outside Codespaces) just use `http://localhost:8787`.

## 5. Troubleshooting port conflicts

Find and stop whatever is already using CodeMind's port instead of killing
all Node processes:

```bash
lsof -ti tcp:8787 | xargs -r kill
```

If `lsof` isn't installed, use `fuser -k 8787/tcp` as a fallback. Avoid
broad commands like `pkill node` — they will also kill unrelated Node
processes (editors, extensions, other terminals).

You can run the server on a different port:

```bash
CODEMIND_CHAT_PORT=8788 npm run serve
```

## 6. MCP server for Claude Desktop / Claude Code (no port, no browser)

`codemind mcp-server` is a separate integration path: it speaks MCP
(JSON-RPC) over **stdio**, not HTTP, so there is no port to forward — your
MCP-compatible client (Claude Desktop, Claude Code, another agent
framework) launches the process itself. Point it at the built CLI:

```json
{
  "mcpServers": {
    "codemind": { "command": "node", "args": ["/absolute/path/to/CodeMind/dist/cli.js", "mcp-server"] }
  }
}
```

Defaults to `READ_ONLY` (15 read-only tools: `read_file`, `list_files`,
`search_files`, `grep`, `glob`, plus reporting/skill tools). Add
`"--mode", "APPROVED_EXECUTION"` to `args` for the full 41-tool surface
(file writes, `bash`, `git`, GitHub write tools, validation runners, web
tools). See [`docs/runtime/CODEMIND_MCP_SERVER.md`](runtime/CODEMIND_MCP_SERVER.md)
for the full tool list and protocol details.
