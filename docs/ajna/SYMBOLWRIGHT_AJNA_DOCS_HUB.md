# SymbolWright Ajna Docs Hub

This hub points operators to the current Ajna planning docs, build docs, and local fixture command docs.

Use it when you need one place to understand what Ajna is, what is already available locally, and what should remain behind future policy gates.

## Start here

```text
1. docs/ajna/SYMBOLWRIGHT_AJNA_ROADMAP.md
2. docs/ajna/SYMBOLWRIGHT_AJNA_BUILD_PLAN.md
3. docs/ajna-fixture-command-index.md
```

## Current local fixture path

```text
local fixture request
-> collector snapshot
-> Ajna review report
-> Ajna merge-readiness report
```

The fastest operator reference for the current command sequence is:

```text
docs/ajna-fixture-command-index.md
```

## Command docs

```text
docs/ajna-docs-command.md
docs/ajna-client-pipeline-manifest-command.md
docs/ajna-client-pipeline-status-command.md
docs/ajna-client-collector-fixture-command.md
docs/ajna-review-pr-client-collector-fixture-command.md
docs/ajna-merge-readiness-client-collector-fixture-command.md
```

## Design boundary

Current Ajna work is still local-first and evidence-first.

It does not introduce:

```text
live GitHub ingestion
provider calls
PR comment posting
review approval actions
merge actions
uncontrolled repository mutation
```

Future live integrations should remain behind SymbolWright policy gates and explicit operator approval.
