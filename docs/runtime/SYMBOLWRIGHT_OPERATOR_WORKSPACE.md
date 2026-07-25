# CodeMind Operator Workspace

The CodeMind Operator Workspace is the first real cockpit layer for running CodeMind like an interactive coding agent instead of a static command list.

## Start it

```bash
npm install
npm run build
npm link
codemind operator
```

For a one-shot mission without opening the prompt:

```bash
codemind operator "inspect this repo and propose the next safest PR bundle"
```

## Prompt model

```txt
CodeMind >
```

Plain text is treated as a mission. The current CM-400 boundary routes mission text into read-only planning first.

## Slash commands

```txt
/help
/status
/doctor
/runtime-status
/scan [dir]
/read <path>
/search <query>
/plan <goal>
/run <goal>
/validation-plan [focus]
/propose <goal>
/pr-notes [focus]
/history
/session
/clear
/exit
```

## Safety boundary

CM-400 is intentionally read-first and approval-first.

- Plain mission input creates a read-only plan.
- `/run <goal>` uses the bounded read-only runtime loop.
- `/propose <goal>` drafts a patch proposal but does not apply it.
- No file write is performed by the operator console in this phase.
- No arbitrary shell execution is exposed.
- No GitHub write, merge, branch push, or workflow rerun is exposed.

## Terminal layout in Codespaces

Use this layout while developing CodeMind itself:

```txt
Terminal 1: codemind operator
Terminal 2: optional focused dev command or future workspace UI server
Terminal 3: npm run typecheck && npm run lint && npm test && npm run build
```

Terminal 3 is just the third terminal tab/pane in Codespaces. It is where checks run without interrupting the operator console.

## Next phase

CM-410 should wire a typed mission timeline and streaming event model into this operator shell:

```txt
mission_started
context_loaded
tool_started
tool_completed
proposal_created
approval_required
validation_started
validation_completed
mission_completed
```
