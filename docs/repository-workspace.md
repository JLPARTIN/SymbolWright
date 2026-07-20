# Repository Workspace (Large PR Bundle 2)

The **Repository** tab in the unified app shell (`npm run serve`, then open
port `8787` and click **Repository**) is a real, server-backed work surface
for the checked-out git working tree — distinct from the **Workspace** tab,
which stays a browser-localStorage-only "Scratch Workspace" (edits there are
never written to disk or to git).

## What it does

- **Browses the real file tree** one directory level at a time (lazy
  expand/collapse), skipping the same noisy directories (`node_modules`,
  `.git`, `dist`, `coverage`, `.next`) every other CodeMind file tool skips.
- **Opens and edits real files.** Saving writes through the same
  checkpoint-bound guarded path `edit_file` uses — every write is snapshotted
  first (visible and restorable from the **Checkpoints** tab), and a file
  that changed on disk since it was loaded returns a conflict instead of a
  silent overwrite: you're shown the current on-disk content and asked
  whether to overwrite it or reload it.
- **Shows real git status and diffs** — staged/unstaged/untracked/conflicted
  file lists, and a raw unified diff per file.
- **Branches**: lists local branches, creates and switches to a new one.
  Creating (or pushing to) `main`/`master`/`production`/`release` directly is
  blocked.
- **Commits**: stages everything (or a specific file list) and commits with a
  message. CodeMind's own `.codemind/` checkpoint/session state is always
  excluded from "commit everything", regardless of the repository's own
  `.gitignore`.
- **Pushes** the current branch, with an explicit confirmation dialog before
  anything happens. There is no way to request a force push from this UI —
  the route never accepts a force flag from the client at all.
- **Creates a real draft pull request** via the GitHub API (branch, commit,
  and PR creation, all over REST — no local `git push` or git credentials
  required for this path), also confirmation-gated. If `GITHUB_TOKEN` isn't
  configured on the server, this returns a clear error rather than
  pretending to succeed.

## API routes

All of the following require `Authorization: Bearer $CODEMIND_API_KEY`. See
the full table in [`API_REFERENCE.md`](API_REFERENCE.md).

```
GET  /api/repository/tree
GET  /api/repository/file
PUT  /api/repository/file
GET  /api/repository/status
GET  /api/repository/diff
GET  /api/repository/branches
POST /api/repository/branches
POST /api/repository/commit
POST /api/repository/checkpoints/:id/restore
POST /api/repository/push
POST /api/repository/pull-request
```

## What this is not

- **Not a replacement for the Workspace tab.** The Workspace tab's
  browser-local sessions (multi-file, JS/TS/SQL/Python runners, project
  bundle import/export) are unrelated and unaffected — they still never
  touch the real filesystem or git.
- **Not a sandbox runner.** File writes go straight to disk via Node's `fs`,
  the same way `edit_file` already works — not through the Docker-sandboxed
  path `local_file_write` (that tool exists to isolate LLM-agent-directed
  writes; spawning a container per interactive browser save would be slow
  and require Docker as a hard dependency, neither warranted for an
  authenticated human operator clicking Save in their own tab).
- **Not multi-operator locking.** Conflict detection is optimistic
  concurrency (a content-hash check on save), not a real lock — if two
  browser tabs edit the same file, the second save wins the race and the
  first gets a 409 with the winning content to reconcile. There is no
  cross-session mission/session persistence yet (planned for a future
  bundle) — reopening the Repository tab starts fresh each time.
