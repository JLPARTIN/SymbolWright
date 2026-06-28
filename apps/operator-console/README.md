# CodeMind Operator Console

This app is the standalone CodeMind extraction of the AELIB CodeMode browser workspace.

## Run locally or in Codespaces

From the CodeMind repo root:

```bash
npm install
npm run build
cd apps/operator-console
npm install
npm run dev
```

Open the forwarded port for `3005` and go to:

```txt
/codemode
```

## What this extracts from AELIB

The workspace is based on AELIB's existing CodeMode pattern:

- browser terminal-style console;
- governance selector with `strict`, `standard`, and `off` choices;
- quick actions for CodeMind commands;
- mission input;
- server-side API route at `/api/codemode`;
- command output streamed back into the browser-style console history.

## Current bridge

The API route calls standalone CodeMind through:

```bash
node dist/cli.js <command>
```

The CodeMind root is resolved from `CODEMIND_ROOT`, the repo root two levels above this app, or the current working directory.

## Next hardening step

Wire the extracted app into root workspace scripts and CI after a package-lock update is generated locally.
