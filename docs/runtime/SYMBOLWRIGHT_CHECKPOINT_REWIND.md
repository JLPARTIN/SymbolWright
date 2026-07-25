# SymbolWright Checkpoint + Rewind

The safety spine: every mutating write goes through a snapshot first, so any
edit SymbolWright makes can be undone file-by-file, with the restore verified
against a recorded hash — never a blind overwrite, never a global `git
reset`.

## What triggers a checkpoint

Automatically, before any actual write from:

```txt
edit_file
local_file_write
apply_patch
```

A checkpoint is only persisted once a write genuinely happens. A blocked
write (policy denial) or a `local_file_write`/`apply_patch` dry run never
touches disk, so nothing is checkpointed — there's nothing to snapshot or
restore. `apply_patch` covering several files in one call produces a single
checkpoint covering every file that call actually wrote.

## Layout

```txt
.symbolwright/checkpoints/<session-id>/<checkpoint-id>/checkpoint.json
.symbolwright/checkpoints/<session-id>/<checkpoint-id>/files/<mirrored target path>
```

`checkpoint.json`:

```json
{
  "checkpointId": "ckpt-1783028588688-5d04300c",
  "sessionId": "cm-demo-session",
  "tool": "edit_file",
  "createdAt": "2026-07-02T21:43:08.690Z",
  "files": [
    {
      "targetPath": "config.ts",
      "existedBefore": true,
      "originalHash": "79c6288da7b8fe6ae38429c8258a61abc5bd414c9fa421c8e04f7d8ea86b4292",
      "snapshotFile": "config.ts"
    }
  ],
  "restores": []
}
```

`files/` never stores raw content in the metadata JSON itself — each touched
file's pre-mutation content is copied byte-for-byte under `files/`, mirroring
its relative path (`files/src/foo/bar.ts` for `src/foo/bar.ts`). A file that
didn't exist before the mutation (a brand-new file) has `existedBefore:
false`, `originalHash: null`, `snapshotFile: null` — there's nothing to copy;
restoring it means deleting whatever now exists at that path, not writing
empty content over it.

Every restore attempt appends a `restores` entry (never overwrites history):

```json
{ "restoredAt": "2026-07-02T21:43:15.949Z", "restoredFileHashes": { "config.ts": "79c6288d..." } }
```

## Session ids are real, never placeholders

`RuntimeToolContext.sessionId` is threaded from the interactive agent
session (`src/cli-agent.ts`) when one exists. When a tool executes without
one — a one-shot CLI invocation, a test, a fixture context — a fresh,
genuinely unique session id is minted on the spot
(`cm-<timestamp>-<8 hex chars>`, `src/checkpoint/checkpoint-session.ts`).
Checkpointing never silently no-ops for lack of a session id, and it never
falls back to a hardcoded string like `"default"`.

## Restore: hash-verified, file-by-file, never a global reset

`restoreCheckpoint` (`src/checkpoint/checkpoint-service.ts`):

```txt
1. policy gate: allowWrites must be true (same convention as every other write gate)
2. checkpoint must exist and its metadata must be readable
3. for each file:
   - didn't exist before -> delete whatever exists there now
   - existed before -> re-hash the stored snapshot and compare to the hash
     recorded at checkpoint time; only write it back if they match
   - a hash mismatch (corruption, hand-edited snapshot) skips that file
     rather than overwriting blind — status becomes integrity_error, and
     the live file is left untouched
4. append a restores entry recording the hash of what was actually written
```

There is no `git reset`, `git checkout`, or any git operation anywhere in
this bundle — restoration is pure file I/O, scoped to exactly the files a
checkpoint touched.

## CLI

```sh
codemind checkpoint list [--session <id>] [--json]
codemind checkpoint show <checkpoint-id> [--json]
codemind checkpoint restore <checkpoint-id> [--json]
```

`checkpoint list` with no `--session` lists across every session in the
workspace, newest first. `checkpoint show`/`restore` look a checkpoint up by
id directly — checkpoint ids are unique workspace-wide, so you don't need to
know which session produced one.

## Evidence + audit trace

`restoreCheckpoint` returns an evidence-shaped result (status, per-file
action, timing) and records a `RuntimeAuditEvent` — `blocked` when policy
denies the restore or the checkpoint can't be found, `allowed` once the
restore actually runs (whether it fully succeeds or hits an integrity
mismatch on some files).

## Try it

```sh
npm run build

# from any workspace: make an edit through a write tool (here, edit_file),
# then list/show/restore the checkpoint it created
node dist/cli.js checkpoint list
node dist/cli.js checkpoint show <checkpoint-id>
node dist/cli.js checkpoint restore <checkpoint-id>
```

This was run for real while building this bundle: an `edit_file` call
changed `port = 3000` to `port = 4000`, `checkpoint list` showed the new
checkpoint, `checkpoint show` displayed its file hash, and `checkpoint
restore` put `port = 3000` back — verified by reading the file afterward.

## Tests

- `src/checkpoint/checkpoint-hash.spec.ts`, `checkpoint-session.spec.ts`,
  `checkpoint-store.spec.ts` — the low-level primitives.
- `src/checkpoint/checkpoint-service.spec.ts` — create/list/get/restore,
  including the hash-mismatch integrity-error path and the policy-denial
  path, entirely against a real temp filesystem (no mocks).
- `src/checkpoint/checkpoint-write-tools.spec.ts` — the full path: drives
  `edit_file`, `local_file_write`, and `apply_patch` through their real
  `RuntimeToolDefinition.execute()`, confirms a checkpoint appears, and
  confirms restoring it genuinely undoes the mutation (including the
  new-file-gets-deleted case, the dry-run-checkpoints-nothing case, and the
  no-session-id-still-checkpoints case).
- `src/cli-checkpoint.spec.ts` — `checkpoint list/show/restore` end-to-end
  through the real CLI render functions.

## Hard boundaries (by design, this bundle)

```txt
no global git reset — restore is file-by-file, never touches git state
no destructive restore without a verified snapshot hash
no fake session ids — every checkpoint is scoped to a real, unique session id
no checkpointing outside what a write tool actually touched — the existing
  write-tool policy gates (protected paths, workspace boundary) already run
  before checkpointing ever sees a request, so node_modules/dist/.git/etc.
  are never swept in as a side effect
```
