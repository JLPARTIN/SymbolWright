# Workspace Console Next

CM-200-M starts the operator surface wiring by adding a standalone workspace executable entrypoint backed by the validated workspace render adapter.

Because the large `src/cli.ts` router is intentionally high-risk to edit through connector-only workflows, this bundle keeps the first integration narrow: build emits `dist/cli-workspace-bin.js`, which can render the workspace console without provider calls, shell execution, file mutation, GitHub writes, or approval bypasses.

The later CLI-router bundle can safely alias this into `codemind workspace [mission]` after the executable entrypoint is validated.
