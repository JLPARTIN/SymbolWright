# CodeMind Approved Local File Writes

Phase T adds the first real local execution step for CodeMind.

The local file write path is still locked behind runtime policy and operator approval. The default runtime policy remains read-only.

## What changed

The local file write tool can now produce two different execution outcomes:

```txt
DRY_RUN  - preview only, no file change
APPLIED  - approved local file content was saved
```

A blocked request still returns a blocked execution report and does not modify files.

## Required controls

A local write can only be applied when:

```txt
allowWrites is enabled in the runtime policy
an approval ticket is present
the approval includes file:write
the target stays inside the workspace
the target is not protected
a reason is supplied
a rollback note is supplied
dryRun is false
```

## Dry run

Dry run mode evaluates the request, renders a diff preview, emits audit output, and leaves the workspace unchanged.

## Applied write

Applied mode writes content only after the gate allows the request. The execution report includes the target, resolved path, bytes written, rollback note, and diff preview.

## Still out of scope

Phase T does not add shell execution, network access, GitHub writes, branch creation, pull request creation, pull request comments, labels, or merge actions.
