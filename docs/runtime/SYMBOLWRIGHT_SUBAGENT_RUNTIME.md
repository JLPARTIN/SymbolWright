# SymbolWright Subagent Runtime v1

Three named, read-only worker subagents — `explorer`, `reviewer`,
`test-planner` — dispatched from the top-level agent loop (or the CLI)
through a real, isolated child `runAgentLoop()` run. Built on top of the
existing HiveMind swarm dispatcher rather than a parallel system: it fixes
HiveMind's isolation gaps (real tool-list filtering instead of
policy-only blocking, a linked parent/child session id, structured
findings/evidence/risks output) and reuses everything else — the same
`runAgentLoop`, the same tool registry, the same audit log.

## The three workers

| Name           | Purpose                                                          |
| -------------- | ----------------------------------------------------------------- |
| `explorer`     | Locates relevant files, maps repo structure, gathers context.     |
| `reviewer`     | Assesses correctness, risk, and merge readiness of a change.      |
| `test-planner` | Identifies coverage gaps and proposes a validation plan.          |

All three are `mode: 'readonly'` (`src/hivemind/subagent-definitions.ts`).
There is no general-purpose "coder" worker in this bundle — nested
mutation is available only by explicitly turning governance on for a
dispatch (see below), not as a separate agent identity.

## Real isolation, not policy-only blocking

Every prior swarm-agent dispatch passed the parent's *entire* tool list
into the child's agent loop and relied solely on the policy snapshot to
block anything it shouldn't do — a withheld tool was still visible to the
model, it just failed when called. Subagent dispatch is different:
`buildChildToolset()` (`src/hivemind/subagent-dispatcher.ts`) filters
`assembleAgentTools()` down to exactly the dispatched worker's
`allowedTools` before the child agent loop ever starts. A withheld tool
is never in the child's tool schema, so the model can't call it — not
"calls it and gets denied," but "doesn't know it exists."

Every worker's `allowedTools` is read-only core tools only:

```txt
read_file, list_files, search_files, glob, grep, memory_recall
```

plus a small worker-specific addition (`web_fetch`/`web_search` for
`explorer`, `preflight` for `reviewer`, `validation_plan` for
`test-planner`).

## Governance is per-dispatch, off by default

Every mutation-capable tool — `edit_file`, `local_file_write`,
`apply_patch`, `bash`, `git`, the GitHub write tools, and nested
`swarm_dispatch`/`subagent_run` — lives in each worker's `governedTools`,
never in `allowedTools`. A dispatch only gets them when the caller
explicitly passes `enableGovernedTools: true` for *that dispatch*:

```ts
await dispatcher.dispatch({
  subagent: 'test-planner',
  goal: 'write and run the missing auth tests',
  enableGovernedTools: true, // grants exactly test-planner's governedTools, nothing broader
})
```

When governance is off (the default), `buildChildPolicy()` additionally
forces the child's policy to `READ_ONLY` — `allowWrites`, `allowShell`,
and `allowGitHubWrites` are all hard-set to `false` regardless of what the
parent session's own policy allows. A `READ_ONLY` child dispatched from an
`APPROVED_EXECUTION` parent session still can't write. When governance is
explicitly on, the child inherits the parent's real policy unchanged, so
the now-visible governed tools actually work.

## Parent/child session linkage

Every dispatch mints a real, unique child session id —
`sub-<timestamp>-<8 hex chars>` (`src/hivemind/subagent-session.ts`,
mirroring the `cm-`/`ckpt-` id convention already used for agent and
checkpoint sessions) — and threads it through as
`RuntimeToolContext.sessionId` for the child's tool calls. The evidence
returned from a dispatch carries both `parentSessionId` and
`childSessionId`, so anything the child does (including checkpoints it
creates, if governance is on) is traceable back to the session that
spawned it.

## Structured output

Every worker's system prompt instructs it to close with:

```txt
## Findings
- one finding per line
## Evidence
- file paths, line ranges, or quotes backing each finding
## Risks
- anything the parent should be cautious about before acting
```

`parseSubagentResult()` best-effort-parses those headers into
`{ findings, evidence, risks, rawOutput }`. When a model doesn't follow the
structure, the raw text is preserved as a single finding rather than
fabricating a breakdown that isn't there — no fake structure over an
unstructured answer.

## Wiring

Same static-stub + `createWiredXTool()` pattern as `swarm_dispatch`:

- `subagentRunTool` (`src/runtime/tools/subagent-run-tool.ts`) is the
  static fallback registered in `ALL_TOOLS` — reports `QUEUED` and that a
  live dispatcher is required.
- `createWiredSubagentRunTool(dispatcher, onResult)` produces the real
  tool, swapped in by `wireSubagentRunTool()` inside
  `runActivatedAgent()` (`src/activation/symbolwright-activation.ts`).
  `activateSubsystems()` constructs one `SubagentDispatcher` per session,
  bound to the session's real provider, tool context, and session id.
- `SymbolWrightActivationResult.subagentDispatches` collects every dispatch's
  evidence for the caller.

## CLI

```sh
codemind subagent list
codemind subagent run <explorer|reviewer|test-planner> "<goal>" [--enable-governed] [--json] [--mode <mode>]
```

`subagent list` is fully static — no provider, no API key, just reads
`SUBAGENT_DEFINITIONS`. `subagent run` resolves a real provider through
the same config path as `codemind agent` and dispatches for real.

## Try it

```sh
npm run build
node dist/cli.js subagent list
node dist/cli.js subagent run explorer "find the auth code"
```

Run for real while building this bundle: `subagent list` printed all three
workers with their real allowed/governed tool lists straight from
`SUBAGENT_DEFINITIONS`. `subagent run` without `ANTHROPIC_API_KEY`
configured failed honestly with `Invalid SymbolWright config: Missing API
key...` and a non-zero exit code — no fake success, no canned output —
confirming the CLI is wired through the real config-resolution path
before it ever reaches a provider or the dispatcher.

## Evidence + audit trace

`dispatchSubagent()` returns a `SubagentDispatchEvidence`: status
(`completed`/`blocked`/`error`), parent/child session ids, whether
governance was enabled, the tools actually used (ground-truthed against
the child's real allowlist — a call the model *attempted* toward a
withheld tool never counts as "used"), iteration count, token usage, the
structured result, and an `auditTrace` of `RuntimeAuditEvent`s (`blocked`
for an unknown subagent name, `allowed` for every real run whether it
completed or errored).

## Tests

- `src/hivemind/subagent-session.spec.ts` — id format and uniqueness.
- `src/hivemind/subagent-definitions.spec.ts` — every worker is
  `readonly`, every listed tool name is real and registered, no mutation
  tool is ever in `allowedTools`, `swarm_dispatch`/`subagent_run` are
  governed-not-allowed for every worker, `allowedTools`/`governedTools`
  never overlap.
- `src/hivemind/subagent-dispatcher.spec.ts` — `parseSubagentResult`
  parsing; unknown-subagent blocks before touching the provider; a real
  dispatch produces a distinct real child session id; a withheld
  `edit_file` call attempt never shows up in `toolsUsed`, proven against
  the real agent loop (not asserted in the abstract) after fixing an
  earlier version of this test that only spied on a tool that was never
  wired into the actual dispatch path; `buildChildPolicy` is asserted
  directly for both the forced-`READ_ONLY` and governance-enabled cases;
  the iteration-limit path threads through as a real `error` status.
- `src/runtime/tools/subagent-run-tool.spec.ts` — input parsing, the
  static QUEUED fallback, and the wired tool rendering real evidence.
- `src/cli-subagent.spec.ts` — usage errors, unknown-name rejection
  (before config/provider are ever touched), config-validation-error
  passthrough, a full dispatch with `--enable-governed`, and `--json`.

## Cleanup done alongside this bundle

`HiveMindRemoteBridge` (`src/hivemind/hivemind-remote-bridge.ts`) has been
removed. Its only functioning transport, `dispatchLocal()`, returned a
canned string (`"[Local dispatch] Task ... routed to ... agent."`)
without doing any real work, and the class had no callers anywhere in the
codebase outside its own spec — a dead class whose one working path was
fake. Real local dispatch is what `HiveMindDispatcher` and
`SubagentDispatcher` already do.

## Hard boundaries (by design, this bundle)

```txt
no tool visible to a child that isn't in its allowedTools (+ governedTools
  when explicitly enabled for that dispatch) — filtering happens before
  the child agent loop starts, not as a runtime policy check
no write/shell/GitHub-write capability for a child unless governance is
  explicitly turned on for that specific dispatch
no fake session ids — every child session id is real and unique
no fabricated findings/evidence/risks structure when the model didn't
  produce one — the raw text is kept as-is instead
no general-purpose "coder" subagent identity in this bundle — mutation is
  strictly an opt-in capability grant on top of a read-only worker
```
