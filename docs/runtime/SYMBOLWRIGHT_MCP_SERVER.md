# SymbolWright as an MCP Server (`codemind mcp-server`)

`docs/runtime/SYMBOLWRIGHT_MCP_TOOL_RUNTIME.md` covers SymbolWright acting as an MCP
**client** (spawning and calling *other* MCP servers). This is the reverse
direction: SymbolWright itself acting as an MCP **server**, so any MCP-compatible
LLM client — Claude Desktop, Claude Code, or another agent framework — can
add SymbolWright as a plugin/connector and call its real tools directly.

```txt
Claude Desktop / any MCP client  →  spawns "codemind mcp-server" as a subprocess
        ↓  stdio, newline-delimited JSON-RPC 2.0
SymbolWright MCP server  →  runtime tool registry (same tools codemind agent uses)
```

## Start it

Point your MCP client at:

```json
{
  "mcpServers": {
    "symbolwright": {
      "command": "codemind",
      "args": ["mcp-server"]
    }
  }
}
```

(or `npx codemind mcp-server` if not installed globally). No network port, no
API key — the client owns the process over stdio, exactly like any other
local MCP server.

## Runtime mode — read this before changing it

`codemind mcp-server` defaults to **`READ_ONLY`**, not
`APPROVED_EXECUTION` (the default everywhere else in SymbolWright, including
`codemind agent`). That's a deliberate, narrower default: `codemind agent` is
a session an operator drives turn-by-turn from their own terminal;
`mcp-server` is a background process that *any* connected MCP client can
call without a human watching each call. Add `--mode` to opt into more:

```bash
codemind mcp-server --mode READ_ONLY          # default: read/search/plan tools only
codemind mcp-server --mode PROPOSAL_ONLY      # + patch/PR-note/CI-review drafting
codemind mcp-server --mode APPROVED_EXECUTION # + bash, file writes, git, GitHub writes
```

Same aliases as everywhere else (`--mode approved`, `--mode read-only`, etc. — see
`docs/runtime/SYMBOLWRIGHT_RUNTIME_FOUNDATION.md`).

## What's exposed

Tool availability is gated by `bridgeToolsForProvider` (`src/agent/tool-schema-bridge.ts`)
— the exact same mode-to-capability mapping `codemind agent` uses, applied to
`assembleAgentTools()` (`src/runtime/tools/tool-assembly.ts`), the same
statically-wired tool set the live agent loop runs on. There is no separate,
cut-down tool list maintained for MCP — if a tool is real and wired into
`codemind agent`, it's real and available here too, subject to the same mode
gate. In `READ_ONLY` that's `read_file`, `list_files`, `search_files`, `glob`,
`grep`, plus review/evidence/skill tools; `APPROVED_EXECUTION` adds `bash`
(sandboxed via `DockerSandboxRunner`), `edit_file`, `local_file_write`,
`apply_patch`, `git`, GitHub write tools, and more — run `tools/list` against
a running server to see the exact set for your chosen mode.

A few tools that need extra wiring in `codemind agent` (GitHub client
credentials, an embedding provider, a workspace manager) run with only
`{cwd, policy}` context here. If a tool needs an adapter that isn't present,
its call returns a normal `isError: true` result explaining the failure — it
does not crash the server or leak partial state.

## Protocol

Newline-delimited JSON-RPC 2.0 over stdio, same wire format as
`mcp-stdio-transport.ts` uses on the client side. Handshake: `initialize` →
`notifications/initialized`. Then `tools/list` and `tools/call`. The server
negotiates `protocolVersion` down to whichever of `2025-11-25`, `2025-06-18`,
or `2024-11-05` the client requests, defaulting to `2025-06-18` if the client
asks for something else. A tool-execution error (unknown tool, thrown
exception, missing context) is always returned as a normal `CallToolResult`
with `isError: true` — never a crashed process or a protocol-level error —
so one bad call can't take down the session.

Implementation: `src/mcp/mcp-server-protocol.ts` (JSON-RPC dispatch, no I/O,
directly unit-tested), `src/mcp/mcp-server-tools.ts` (bridges the runtime
registry into the MCP tool-handler shape), `src/mcp/mcp-server.ts` (stdio
wiring), `src/cli-mcp-server.ts` (the `mcp-server` CLI command).

## What this is not (yet)

This exposes SymbolWright's tool surface, not the full `codemind agent`
multi-turn conversational loop — an MCP client calls tools directly (e.g.
`read_file`, then `edit_file`, then `run_tests`); it does not get a single
"chat with SymbolWright" tool that runs an entire agent turn internally. Combined
with `codemind serve` (see `docs/runtime/SYMBOLWRIGHT_CHAT_SERVER.md`), SymbolWright
is now usable from a browser (bring-your-own provider key) and from any
MCP-compatible LLM client (this document) — see
`docs/USING_SYMBOLWRIGHT_FROM_ANY_LLM.md` for the full picture across both.
