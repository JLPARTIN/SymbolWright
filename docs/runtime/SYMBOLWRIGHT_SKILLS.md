# SymbolWright Skills v1

SymbolWright Skills are file-based, reusable coding-agent workflows. They use the same basic shape as Claude Code skills while staying SymbolWright-native: every shell command, forked subagent run, and mutation still goes through SymbolWright runtime policy, checkpointing, and tool isolation.

## Skill locations

SymbolWright loads skills from these locations, in this precedence order:

1. `.symbolwright/skills/<skill-name>/SKILL.md` — native project skills
2. `.claude/skills/<skill-name>/SKILL.md` — Claude-compatible project skills
3. `.claude/commands/<command>.md` — Claude command compatibility fallback
4. bundled SymbolWright skills — available out of the gate

Project skills override bundled skills with the same command name. This lets a repository customize `repo-forensics`, `run`, or `verify` without changing SymbolWright internals.

## CLI

```bash
symbolwright skill list
symbolwright skill show repo-forensics
symbolwright skill run repo-forensics "focus on runtime wiring"
```

Forked skills can explicitly grant governed tools for that one dispatch:

```bash
symbolwright skill run pr-review 219 --enable-governed
```

Disable dynamic context injection for one CLI run:

```bash
symbolwright skill run summarize-changes --no-dynamic-context
```

Disable skill shell execution globally for the process:

```bash
SYMBOLWRIGHT_DISABLE_SKILL_SHELL_EXECUTION=1 symbolwright skill run summarize-changes
```

## SKILL.md format

Every skill has a `SKILL.md` file with YAML frontmatter and markdown instructions.

```md
---
name: repo-forensics
description: Forensic repository review with evidence and next PR recommendation.
when_to_use: Use when auditing repo readiness or planning PR bundles.
argument-hint: [focus]
context: fork
agent: explorer
allowed-tools:
  - read_file
  - list_files
  - search_files
  - glob
  - grep
---
Run a forensic repository review for: $ARGUMENTS

1. Inspect actual files.
2. Find duplicate or unwired runtime code.
3. Return evidence-backed findings.
```

Supported v1 frontmatter:

- `name`
- `description`
- `when_to_use` / `when-to-use`
- `argument-hint`
- `arguments`
- `disable-model-invocation`
- `user-invocable`
- `allowed-tools`
- `disallowed-tools`
- `context`: `inline` or `fork`
- `agent`: `explorer`, `reviewer`, or `test-planner`
- `paths`
- `shell`: `bash` today; `powershell` is parsed but blocked until a PowerShell runner exists

## Arguments and substitutions

Skills support these substitutions:

- `$ARGUMENTS`
- `$ARGUMENTS[0]`
- `$0`, `$1`, etc.
- named arguments from the `arguments` frontmatter list
- `${SYMBOLWRIGHT_SESSION_ID}` and `${CLAUDE_SESSION_ID}`
- `${SYMBOLWRIGHT_SKILL_DIR}` and `${CLAUDE_SKILL_DIR}`
- `${SYMBOLWRIGHT_PROJECT_DIR}` and `${CLAUDE_PROJECT_DIR}`

If a skill declares:

```yaml
arguments: [issue, branch]
```

then `$issue` expands to the first argument and `$branch` expands to the second.

## Dynamic context injection

A skill can request command output before the skill is run:

```md
## Current diff

!`git status`
```

or with a fenced block:

````md
```!
git status
```
````

SymbolWright does not bypass its runtime policy for these commands. Dynamic context uses the existing sandboxed bash execution path. If policy blocks shell execution, the injected section is replaced with a clear blocked message instead of silently running.

## Forked skills

A skill with `context: fork` runs through the existing Bundle 4 subagent runtime when a live dispatcher is available.

```yaml
context: fork
agent: reviewer
```

That gives the skill an isolated child session, real tool-list isolation, structured findings/evidence/risks, and the same governed-tools switch used by `symbolwright subagent run`.

## Bundled skills

SymbolWright ships these bundled Skills v1 entries:

- `repo-forensics`
- `pr-review`
- `test-planner`
- `codespaces-diagnostics`
- `run`
- `verify`

They are real runtime entries, not documentation-only placeholders: `symbolwright skill list`, `symbolwright skill show <name>`, and `symbolwright skill run <name>` all reach the same parser/render/dispatch path as project skills.

## Boundaries

Skills do not create a parallel runtime. They reuse:

- MCP runtime
- web fetch/search runtime
- checkpoint + rewind runtime
- subagent runtime
- runtime policy
- provider schema bridge
- tool assembly

Skills do not bypass write gates. If a skill causes a file mutation through normal SymbolWright tools, the checkpoint system still snapshots touched files before mutation.
