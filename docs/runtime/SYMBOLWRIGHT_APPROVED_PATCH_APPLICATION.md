# CodeMind Approved Patch Application

Phase U adds an approved structured patch application runtime capability.

The first Phase U implementation intentionally uses structured full-file changes rather than free-form unified diff parsing. Each patch file entry contains a target path and full replacement content.

## Runtime tool

```txt
apply_patch
```

## Safety model

The patch tool composes the existing local file write gate. It does not bypass Phase T.

A patch can only be applied when every file change passes the same controls used by `local_file_write`:

```txt
allowWrites is enabled
approval is present
approval includes file:write
target path remains inside the workspace
target path is not protected
reason is provided
rollback note is provided
```

## Dry run

Dry run mode previews every file change and leaves the workspace unchanged.

## Apply mode

Apply mode writes each approved full-file change only after preflight checks pass for the patch request.

## Boundaries

Phase U does not add shell execution, validation command execution, GitHub writes, branch creation, pull request creation, pull request comments, labels, merge actions, provider calls, or network ingestion.
