export interface BundledSkillAsset {
  readonly commandName: string
  readonly markdown: string
}

export const BUNDLED_SKILLS: readonly BundledSkillAsset[] = [
  {
    commandName: 'repo-forensics',
    markdown: `---
name: repo-forensics
description: Forensic repository review with evidence, risks, and the next independently mergeable PR. Use when auditing repo readiness, finding duplicate work, or planning PR bundles.
when_to_use: Use when the user asks for a repo audit, forensic review, duplicate detection, runtime reachability check, or PR bundle roadmap.
argument-hint: [focus]
context: fork
agent: explorer
allowed-tools:
  - read_file
  - list_files
  - search_files
  - glob
  - grep
  - web_fetch
  - web_search
---
Run a forensic repository review for: $ARGUMENTS

1. Inspect actual repository files and reachable runtime surfaces.
2. Identify duplicate, unwired, or placeholder-like implementation paths.
3. Verify CLI/runtime/tool assembly/schema wiring where relevant.
4. Return findings with concrete evidence and risks.
5. Recommend the next independently mergeable PR only when it is not already implemented.
`,
  },
  {
    commandName: 'pr-review',
    markdown: `---
name: pr-review
description: Review a pull request or local change set for correctness, risk, tests, and merge readiness.
when_to_use: Use when the user asks to review a PR, inspect changed files, or decide whether work is ready to merge.
argument-hint: [pr-number-or-focus]
context: fork
agent: reviewer
allowed-tools:
  - read_file
  - list_files
  - search_files
  - glob
  - grep
  - preflight
  - web_fetch
---
Review this pull request or change set: $ARGUMENTS

1. Identify the changed surface and intended behavior.
2. Check for missing runtime wiring, schema registration, CLI reachability, and tests.
3. Call out regressions, brittle assumptions, or missing validation.
4. Return a READY / NEEDS_WORK / BLOCKED recommendation with evidence.
`,
  },
  {
    commandName: 'test-planner',
    markdown: `---
name: test-planner
description: Plan focused test and validation coverage for a change without writing or running tests by default.
when_to_use: Use when the user asks what tests are needed or how to validate a PR bundle.
argument-hint: [change-summary]
context: fork
agent: test-planner
allowed-tools:
  - read_file
  - list_files
  - search_files
  - glob
  - grep
  - validation_plan
---
Plan validation for: $ARGUMENTS

1. Identify behavior that changed.
2. Map each behavior to unit, integration, CLI, and regression coverage.
3. List the minimum validation commands to prove the change.
4. Include edge cases and failure-path checks.
`,
  },
  {
    commandName: 'codespaces-diagnostics',
    markdown: `---
name: codespaces-diagnostics
description: Diagnose GitHub Codespaces startup, ports, app launch, and local dev server problems.
disable-model-invocation: true
argument-hint: [symptom]
allowed-tools:
  - read_file
  - list_files
  - search_files
  - glob
  - grep
  - web_fetch
---
Diagnose this Codespaces issue: $ARGUMENTS

1. Inspect package scripts, README launch notes, and app/server entrypoints.
2. Identify expected ports, startup commands, and environment requirements.
3. Produce copy-paste bash steps for mobile/Codespaces use.
4. Avoid destructive commands unless the user explicitly asks for a clean reset.
`,
  },
  {
    commandName: 'run',
    markdown: `---
name: run
description: Launch or describe how to launch this project using discovered scripts and repo instructions.
disable-model-invocation: true
argument-hint: [target]
allowed-tools:
  - read_file
  - list_files
  - search_files
  - glob
  - grep
  - bash
---
Run or prepare to run this project target: $ARGUMENTS

1. Inspect package scripts, README, Makefile, and documented launch paths.
2. Prefer the smallest working command.
3. If execution is allowed by runtime policy, run the command through SymbolWright tooling.
4. Report ports, URLs, and next verification steps.
`,
  },
  {
    commandName: 'verify',
    markdown: `---
name: verify
description: Verify a code change by checking the actual app/runtime behavior when possible, not only static tests.
disable-model-invocation: true
argument-hint: [change-to-verify]
allowed-tools:
  - read_file
  - list_files
  - search_files
  - glob
  - grep
  - bash
  - run_tests
  - run_typecheck
  - run_lint
---
Verify this change: $ARGUMENTS

1. Identify the intended behavior and affected surfaces.
2. Choose the most direct proof: app/runtime behavior first, then tests/typecheck/lint.
3. Run only policy-allowed validation commands.
4. Return proof, gaps, and the next action if verification fails.
`,
  },
] as const
