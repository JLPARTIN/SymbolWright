# Phase N — PR Preparation from Approved Local Changes

Phase N introduces PR preparation, which generates a PR title, body, changed file list, and validation checklist from approved local changes without pushing any branch or creating any GitHub PR.

## Design

The PR preparation evaluator checks that all required fields are present:

1. **Title** — Non-empty PR title
2. **Body** — Non-empty PR description
3. **Base branch** — Target branch for the PR
4. **Head branch** — Source branch with changes (must differ from base)
5. **Changed files** — At least one file must be listed
6. **Validation checklist** — At least one validation step is required
7. **Reason** — Why this PR is being prepared

The evaluator returns `READY` when all checks pass, or `INCOMPLETE` with accumulated issues.

## Output

When `READY`, the full PR preparation is rendered including:

- Title, base/head branches, reason
- Changed file list
- Validation checklist with unchecked checkboxes
- Full PR body content
- Clear `PREPARATION_ONLY` status indicating no push or PR creation occurred

When `INCOMPLETE`, the output shows the issues that need to be resolved.

## Audit Events

Every evaluation produces a `RuntimeAuditEvent`:

- Action: `pr_preparation`
- Status: `allowed` (READY) or `blocked` (INCOMPLETE)
- Detail: includes title, file count, and branch information

## CLI Command

```txt
symbolwright pr-preparation <json-file>
```

The fixture JSON must include:

```json
{
  "title": "Phase N: PR preparation",
  "body": "Add PR preparation feature.",
  "baseBranch": "main",
  "headBranch": "feature/phase-n",
  "changedFiles": ["src/pr-prep.ts"],
  "validationChecklist": ["npm run typecheck", "npm test"],
  "reason": "Deliver Phase N"
}
```

## Runtime Tool

The `pr_preparation` tool is registered with capability `PR_PREPARATION`. It parses input, evaluates the preparation, and returns the combined preparation result and audit output.

## Registry

`createPrPreparationRuntimeRegistry()` extends the Phase M validation-command registry with the `pr_preparation` tool, preserving all previous tools in the chain.

## Safety Boundaries

- Title, body, and checklist only — no branch push
- No GitHub writes — no PR creation, no comments, no labels
- No shell execution
- Audit event emitted for every evaluation
- Clear PREPARATION_ONLY status in all output
