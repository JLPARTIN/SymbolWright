# Agent Forensic Process Documentation

## What this document is

This is an operational manual, not a feature audit. Every other file in
`docs/autonomy/` (`BUNDLE6_FINAL_AUTONOMOUS_ENGINEERING_RELEASE.md`,
`BUNDLE7_UNIVERSAL_REPOSITORY_PORTABILITY.md`, `POST_BUNDLE6_FORENSIC_AUDIT.md`,
`POST_BUNDLE7_FORENSIC_AUDIT.md`) documents a shipped capability after the fact.
This document instead records, in reproducible detail, the process an
agent (Claude Code) follows *while doing the engineering work itself* — from
reading a request to a green, reviewable pull request — so that the process
is auditable and another autonomous agent can execute it against this
repository.

It describes **observable operations only**: what gets inspected, what
evidence gets collected, how a decision gets classified, what action follows,
how the action gets validated, how a failure gets repaired, and what gets
reported. It does not claim to expose internal model reasoning — only the
externally visible sequence of tool calls, file reads, commands, and
decisions any operator could reconstruct from a session transcript.

### Labeling legend

Every prescriptive statement in this document is tagged so a reader — human
or agent — knows how much latitude it carries:

| Tag | Meaning |
| --- | --- |
| **[INVARIANT]** | A principle that holds regardless of repository — would still apply if this were a different codebase entirely. |
| **[SYMBOLWRIGHT]** | A concrete adaptation of that principle to *this* repository's actual manifests, scripts, and architecture, as verified by inspection (never invented). |
| **[OPTIONAL]** | An action taken opportunistically when useful, not required for completion. |
| **[GATE]** | A mandatory condition that must hold before a change can be reported complete or a PR moved out of draft. |
| **[AUTH-REQUIRED]** | An action this process must not take without an explicit, in-scope human instruction, even if a tool technically permits it. |

Four categories of claim run through this document and must not be conflated:

1. **Ideal repeatable process** — the sequence this document prescribes as the
   standard way to work in this repository, independent of which specific
   tools happen to be wired up in a given session.
2. **Actions available in the current environment** — the concrete tool
   surface this session actually has (Bash, Read/Write/Edit, Grep/Glob, the
   GitHub MCP tools, Agent/Explore sub-agents). A different session or
   environment may expose a different subset; the process degrades to
   whatever subset is present rather than failing.
3. **Repository-specific commands** — `npm run typecheck`, `npm run lint`,
   `npm run validate`, the exact CI job steps in `.github/workflows/ci.yml`.
   These are read from the repository at intake time, not assumed, and they
   can change as the repository evolves; the manual re-derives them each
   session rather than hardcoding them into behavior.
4. **Actions requiring explicit authorization** — force-push, `git reset
   --hard`, destructive deletes, disabling a CI gate, merging a PR, or any
   other hard-to-reverse or shared-state action. These are never taken on
   session-default authority; see Part IX and the [AUTH-REQUIRED] tag.

---

## Part I — Core Operating Model

### Interpreting the user's request **[INVARIANT]**

A request is read for three layers simultaneously: the literal ask (what
file/behavior/output is named), the implied ask (what must also be true for
the literal ask to be useful — e.g. "fix the bug" implies "don't break
anything else" and "leave evidence it's fixed"), and the boundary of the ask
(what the user did *not* ask for, which is the default no-touch zone). The
request's own vocabulary is evidence of task type: "fix", "bug", "broken",
"failing", "regression" point to corrective work; "add", "implement",
"build", "support" point to feature work; "refactor", "clean up",
"consolidate" point to non-behavior-changing structural work; "CI is red",
"pipeline failing" point to CI-only repair; "document", "explain",
"write up" point to documentation-only work (this very document is an
instance of that category — see the task framing at the top of this file's
originating request, which explicitly says "do not implement a new feature").

### Classifying the task **[INVARIANT]**

| Signal | Classification |
| --- | --- |
| A specific failing test, stack trace, or reproduction steps are given, or "used to work" is implied | Bug fix / regression |
| A capability is requested that doesn't exist anywhere in the repo, scoped to one file or module | Focused feature PR |
| A capability spans persistence, API, UI, tests, docs, and touches multiple existing subsystems | Large PR Bundle |
| Request references a red check, a failing job name, or "CI is failing" with no code-behavior complaint | CI-only repair |
| Request asks only for prose, comments, or a new `.md` file, with an explicit "do not change code" framing | Documentation-only change |
| Request describes an exploitable input, an auth bypass, a secret leak, or a live incident | Security hotfix (highest priority, smallest possible diff, immediate escalation on ambiguity) |
| Request references an already-open Bundle (by name, PR number, or "continue Bundle #N") | Follow-up slice to an existing bundle |

This session's actual task fell into the documentation-only row: the mission
statement is explicit that no issue is being solved and no feature is being
implemented, so classification here drove the entire Part V/Part VI
treatment — no source code under `src/` is touched, only `docs/`,
`README.md`, and `CHANGELOG.md` (**[SYMBOLWRIGHT]**, since which files count as
"docs vs. source" is repository-specific — this repo's own convention, drawn
from `POST_BUNDLE7_FORENSIC_AUDIT.md` and `CHANGELOG.md`, is that new
capability and process docs live under `docs/` and get a one-line pointer in
`CHANGELOG.md`'s `[Unreleased]` section, plus a listing in README's "Current
Foundation Docs" block when they're foundation-level).

### Requirements, constraints, exclusions, acceptance criteria **[INVARIANT]**

- **Explicit requirements** are anything stated as an imperative or a named
  deliverable ("produce a document", "cover Parts I–XIV", "provide a state
  machine").
- **Implied requirements** are anything the explicit requirement cannot be
  satisfied without — e.g. "detailed enough that another agent could use it
  as a blueprint" implies concrete file paths and real command names, not
  abstractions.
- **Constraints** are stated negatives or scoping limits ("do not reveal
  hidden chain-of-thought", "do not merely list generic best practices").
- **Exclusions** are named out-of-scope items ("not solving a new issue",
  "not implementing a new feature").
- **Acceptance criteria** are derived from the deliverable's own structure —
  here, the 14 named Parts, the four decision tables, the two worked
  examples, the state machine with the named states, and the four pseudocode
  algorithms are all individually checkable; completion means every one of
  them exists exactly once, in order, non-empty, and internally consistent.

### Ambiguity and best-effort proceeding **[INVARIANT]**

Ambiguity is handled by first checking whether the repository itself resolves
it (a manifest, an existing convention, a CI job) before treating it as a
genuine open question. A clarification question (`AskUserQuestion`) is
reserved for cases where: (a) the two candidate interpretations lead to
materially different, hard-to-reverse outcomes, and (b) no repository
evidence disambiguates them. Everything else gets a best-effort resolution
using repository convention, with the decision and its rationale stated
in the final report so the user can override it after the fact rather than
before. This session had no such ambiguity: the 14-part outline, target repo,
and target branch were all fully specified by the task, so zero clarification
questions were needed — the only judgment calls were *placement* (where in
the repo's existing doc taxonomy this belongs) and *worked-example grounding*
(Part XIII), both resolved by repository inspection, not by asking.

### Determining the target repository, branch, PR, issue, worktree **[INVARIANT / SYMBOLWRIGHT]**

Target resolution order, each checked before falling back to the next:

1. An explicit repository/branch named in the task (this session's task
   named `JLPARTIN/SymbolWright`, branch `claude/agent-forensic-process-docs-2hxedg` explicitly).
2. The current checkout's `git status` / `git branch --show-current`, if no
   explicit target was given.
3. An open PR or issue number referenced in the task, resolved via the
   GitHub MCP tools (`pull_request_read`, `issue_read`) rather than assumed
   from memory.
4. If none of the above resolve unambiguously, ask.

For this session, step 1 fully resolved the target: repository
`jlpartin/symbolwright`, branch `claude/agent-forensic-process-docs-2hxedg` (already existed locally and on
`origin` at task start — confirmed by `git branch -a` and `git status`
showing a clean tree on that exact branch, so no branch creation was
required, only continuation on it).

### Task-type-to-workflow routing **[INVARIANT]**

| Classification | Workflow used |
| --- | --- |
| Focused corrective patch | Part IV in full, minimal Part V |
| Normal feature PR | Part V, scoped to one slice, no full task graph needed |
| Large PR Bundle | Part V in full, including task graph and staged validation |
| CI-only repair | Part VIII, minimal Part IV (root cause is usually environmental, not logical) |
| Documentation-only change | Intake (Part II) + a lightweight version of Part V's decomposition (audience, structure, placement) — no Part IV, no code validation ladder beyond what CI actually runs against the changed files |
| Security hotfix | Part IV with Part IX's stop-conditions elevated to the top of every step |
| Follow-up slice to an existing bundle | Part V.B (existing-state audit) weighted heavily before any new design, to avoid re-shipping what a prior bundle already shipped |

### Internal work phases, intake through completion **[INVARIANT]**

`INTAKE → REPOSITORY_DISCOVERY → REQUIREMENT_ANALYSIS → (REPRODUCTION →
ROOT_CAUSE_ANALYSIS, bug path only) → DESIGN → TASK_PLANNING →
IMPLEMENTATION → TARGETED_VALIDATION → FULL_VALIDATION → (REPAIR loop as
needed) → DIFF_AUDIT → DOCUMENTATION → PR_PREPARATION → COMPLETE`. The full
state machine, with transition conditions, is given in Part XIV. This
session's own execution is a direct instance of that state machine with the
`REPRODUCTION`/`ROOT_CAUSE_ANALYSIS` states skipped (no bug), which is a
legitimate transition for documentation-only tasks per the routing table
above.

---

## Part II — Repository Intake and Initial Inspection

**[INVARIANT]** ordering rationale: cheapest, most orientation-bearing checks
first (where am I, what state is the tree in), then identity/history
(what branch, what recent work), then project-shape (manifests, CI), then
depth (source tree, tests, docs). Each step either confirms an assumption or
raises a warning sign that changes what happens next.

| # | Inspect | Tool/command used this session | What it answers | Warning signs | Effect on later action |
| - | --- | --- | --- | --- | --- |
| 1 | Repository root | `ls` at cwd | Is this actually the target repo | Missing expected top-level dirs (`src/`, `docs/`) | Abort/re-resolve target if wrong repo |
| 2 | Git status | `git status` | Clean vs. dirty tree, staged/unstaged/untracked | Uncommitted changes not authored this session | Stash/investigate before any destructive git op; never silently discard |
| 3 | Current branch | `git status` header + `git branch -a` | Am I on the designated branch | On `main` or an unrelated branch | Switch/create the designated branch before editing |
| 4 | Remote configuration | (implicit in `git branch -a`, `origin/...` refs) | Is `origin` the expected remote | Missing/unexpected remote | Confirms push target before any push |
| 5 | Recent commit history | `git log --oneline -10` | What was just shipped, project's commit-message idiom | Unexpected in-flight work, commit style mismatch | Match message tone; understand adjacent context (this session's `git log` showed the tail end of Bundle #6/#7 and the post-Bundle #7 forensic audit, which directly informed Part XIII's grounding) |
| 6 | Open PR context | GitHub MCP `pull_request_read` / `list_pull_requests` | Is there already an open PR for this branch | An open PR exists needing update, not creation | Push to existing PR instead of creating a duplicate |
| 7 | Issue context | GitHub MCP `issue_read` / `search_issues` | Linked issue's acceptance criteria | Issue text conflicts with task text | Task text wins; note the discrepancy in the PR body |
| 8 | README and contributor instructions | `Read README.md` | Project purpose, doc index, contribution conventions | No "Getting Started"/doc index at all | Determines whether a new doc needs a README listing |
| 9 | AGENTS.md / CLAUDE.md | `Glob`/`Grep` repo-wide | Repo-specific agent instructions overriding defaults | File doesn't exist | **[SYMBOLWRIGHT]** Confirmed absent in this repo (checked root, `docs/`, two levels deep) — no override to honor, default process applies unmodified |
| 10 | Project manifests | `Read package.json` | Language/ecosystem, scripts, dependencies | Multiple manifests (polyglot) | **[SYMBOLWRIGHT]** Single Node/TypeScript project (`"type": "module"`, `tsc`, `vitest`, `eslint`, `prettier`) — no polyglot handling needed for this task |
| 11 | Lockfiles | `ls package-lock.json` | Pinned dependency graph exists | Lockfile missing or out of sync with manifest | Never hand-edit; only `npm install`/`npm ci` may touch it |
| 12 | Build configuration | `Read tsconfig.json` | Compiler target, strictness | `strict: false` or path-mapping surprises | Affects whether a change needs a build check at all |
| 13 | Test configuration | `Read vitest.config.ts` | Test file glob, coverage thresholds | Include pattern that silently excludes a directory (this repo's own CHANGELOG records exactly this class of bug: forensics tests under `tests/forensics/*.test.ts` never matched `src/**/*.spec.ts` and silently never ran) | Verify new/changed tests actually match the include pattern before trusting a green run |
| 14 | Linting/formatting config | `Read eslint.config.js` | Style rules enforced in CI | Rules stricter than they look (e.g. no-floating-promises) | Anticipate lint failures before writing code |
| 15 | CI workflow files | `Read .github/workflows/*.yml` | Exact gate sequence CI runs | A step the local `npm run validate` doesn't cover, or vice versa | **[SYMBOLWRIGHT]** `ci.yml`'s `validate` job runs, in order: `npm ci` → `npm run audit` → `npm run typecheck` → `npm run lint` → `npm run format:check` → sandbox contract tests → `npm run test:coverage` → `npm run build` → PR preflight (`node dist/cli.js preflight <changed-files>`) → `npm run validate` (an aggregate re-run). For a docs-only change, most of these are no-ops (no `src/` files changed) but PR preflight still classifies the changed files, so it's still worth being aware of. |
| 16 | Deployment configuration | `Read Dockerfile`, `.github/workflows/deploy.yml` | Whether this task touches anything deploy-relevant | N/A for docs work | Not exercised this session — no deploy surface touched |
| 17 | Source tree structure | `ls src/`, targeted `Glob` | Module boundaries, where a new file belongs | An existing directory that already covers the topic | Prevents creating a second implementation beside an existing one |
| 18 | Existing architecture documents | `Read docs/ARCHITECTURE.md`, relevant `docs/autonomy/*.md` | House style for docs, what's already documented | A near-duplicate doc already exists | Reuse/extend instead of duplicating; this session read both `POST_BUNDLE6_FORENSIC_AUDIT.md` and `POST_BUNDLE7_FORENSIC_AUDIT.md` in full specifically to match section structure and tone before writing anything new |
| 19 | Existing tests | `Glob **/*.spec.ts` near a target module | What behavior is already pinned down | A test that already covers the "bug" being reported (means it's not actually reproducible, or is a regression in behavior the test doesn't assert) | Never write a fix that a passing test should have caught without first checking why the test didn't catch it |
| 20 | Generated files | Recognize `dist/`, `*.d.ts` build output | Files that must never be hand-edited | A generated file that looks editable | Edit the source, rebuild, never patch output directly |
| 21 | Vendored files | Recognize `node_modules/`, any `vendor/`-style tree | Third-party code, not ours to change | A bug that appears to be "in" vendored code | Fix belongs upstream or in how we call it, not in the vendored copy |
| 22 | Ignored files | `Read .gitignore` when relevant | What's intentionally untracked (`.symbolwright/` state, build output) | An ignored file the task seems to expect tracked | Don't `git add -A` blindly; add exact intended files by name |
| 23 | Security policies | `Grep` for `SECURITY.md`, governance docs | Disclosure process, security-sensitive paths | A change touching an auth/secrets path | Escalates handling per Part IX |
| 24 | Release/versioning files | `Read package.json` version field, `CHANGELOG.md` | Current version, whether this change needs a changelog entry | Version already bumped ahead of unreleased work | **[SYMBOLWRIGHT]** `CHANGELOG.md` has an active `[Unreleased]` section — new entries append there, not to a new version header |

**Avoiding wrong-target edits [INVARIANT]**: the repo-root check (step 1) and
branch check (step 3) run before any write; `git status` before and after
every batch of edits catches anything unexpected; lockfiles, `dist/`, and
`node_modules/` are treated as read-only unless the task is explicitly a
dependency change; and `git add` this session stages three named files
explicitly (never `git add -A`/`git add .`), so nothing outside the intended
scope can be swept into the commit by accident.

---

## Part III — Building a Repository Mental Model

**[INVARIANT]** principle: the model only needs to be as deep as the blast
radius of the change. A one-line bug fix in a leaf function needs local
call-site understanding; a Large PR Bundle needs the module-boundary and
data-flow understanding described below *before* the first edit, because
undoing a wrong architectural assumption after five files are already
touched is far more expensive than spending extra intake time up front.

How each element gets identified, generically:

- **Entry points** — `package.json`'s `bin`/`main`/`exports` fields, plus
  `src/cli.ts`-style files and `src/app/api/*-routes.ts` for HTTP surfaces.
- **Core modules vs. internal APIs** — directory-per-concern layout
  (`src/autonomy`, `src/mission`, `src/agent`, `src/ajna`, `src/runtime`,
  `src/sandbox`, `src/portability`…) where a module's public surface is what
  its `index.ts` (if present) or non-`.spec.ts` exports expose, and internal
  helpers are whatever only that module's own files import.
- **Dependency boundaries and data/control flow** — traced by following
  imports from an entry point inward (`Grep` for `from '../autonomy/...'`
  style imports), not by reading every file; confirmed against real call
  chains the way `POST_BUNDLE7_FORENSIC_AUDIT.md`'s "Verification trial"
  section does (`mission-routes.ts` → `createServerAutonomyRuntime` → …).
- **State ownership / persistence** — grep for the storage primitive in use
  (this repo uses an atomic-write JSON-on-disk store under `.symbolwright/`, per
  `mission-store.ts`, `mission-atomic-temp.spec.ts`, and the Bundle #6 doc's
  `.symbolwright/autonomy/releases/<missionId>.json` convention) rather than
  assuming a database exists.
- **Background jobs / network boundaries / security boundaries** — CI-defined
  (`--network none` in the sandbox runner, policy gates named
  `SYMBOLWRIGHT_APPROVED_*` in `docs/runtime/`) rather than inferred.
- **UI/backend boundaries** — `src/app/views/*.ts` (browser-rendered) vs.
  `src/app/api/*-routes.ts` (server) is the concrete split in this repo.
- **Test boundaries** — this repo colocates unit/contract tests as
  `*.spec.ts` beside the module they cover (confirmed by `vitest.config.ts`'s
  include pattern and the CHANGELOG entry describing the `tests/forensics/`
  relocation bug above) rather than a separate top-level `tests/` tree.
- **Language boundaries** — n/a for source (single TypeScript codebase), but
  Bundle #7's portability layer explicitly reasons about *other repositories'*
  polyglot boundaries (Node/Python/Go/Rust/Java/.NET/Ruby/PHP) — a case where
  "the codebase we're editing" and "the codebases the codebase analyzes" are
  different things, and conflating them would be a real modeling error.
- **Existing abstractions / extension points** — e.g. `MISSION_EVENT_FILTERS`
  as the canonical filter list that `missions-view.ts` should import rather
  than re-declare (exactly the anti-pattern `POST_BUNDLE7_FORENSIC_AUDIT.md`'s
  F1 found and fixed).
- **Architectural debt / duplicate implementations / dead or placeholder
  code / mock production paths / feature flags / incomplete migrations /
  deprecated paths** — surfaced by: reading forensic-audit docs (they
  actively hunt for and document exactly these), `Grep` for `TODO`/`FIXME`/
  `deprecated`, checking whether a "historical doc still uses approval-era
  names" (README explicitly flags this for older `docs/runtime/` files),
  and diffing what a doc *claims* against what `Grep`ping the real source
  shows is wired up — never trusting a doc's claim without a source check.

Tools used to build the model, in the order they're reached for: `Glob` for
"does a file like this exist," `Grep` for "where is this symbol/string used,"
`git log --follow`/`git blame` for "why does this code look this way and is
it recent," reading test *names* before test bodies (names encode intended
behavior compactly), type definitions before implementations (cheaper
signal), call-site analysis before modification (who breaks if this
changes), existing docs for stated intent, and — for a bug — actual runtime
output, error messages, and CI logs as the highest-value evidence because
they describe *actual* behavior rather than *intended* behavior.

**Understanding threshold**: for a focused patch, "enough" means the
function being changed, its direct callers, and its existing test coverage
are all read. For a Large PR Bundle, "enough" means every module the new
work will touch has been read for its public surface *and* its test file has
been skimmed for behavioral contracts, *and* an explicit existing-state audit
(Part V.B) has run — because the single most expensive Large-PR-Bundle
mistake is building a second implementation beside one that already exists,
which this repository's own commit history shows happens often enough that
forensic audits are a standing convention here.

---

## Part IV — Exact Bug-Fix Workflow

### Operational reasoning record format **[INVARIANT]**

Parts IV and XII use a repeating observable-reasoning record wherever a
decision is made from evidence. The record has five fields — **Evidence**
(what was directly observed: a log line, a test name, a diff, a file
read), **Decision** (what was concluded from that evidence, stated as a
falsifiable claim), **Action** (the concrete tool call or command that
followed), **Result** (what the action actually produced), and **Next
decision** (what the result implies about the next step). This is an
externally observable trace, not a reconstruction of private
chain-of-thought: every field names a real artifact (a file, a command,
an output) that a reviewer could independently re-check. Illustrative
form:

> **Evidence**: the failing test reports a timeout in
> `DockerPortableValidationRunner`.
> **Decision**: reproduce with the same Node version and timeout
> configuration the CI job uses, rather than assuming the timeout value
> itself is wrong.
> **Action**: run the targeted test and inspect recent changes to timeout
> handling (`git log -p` on the runner's timeout constant and readiness
> check).
> **Result**: failure reproduces only under constrained container
> startup (a slow-starting container), not under normal startup.
> **Next decision**: change the readiness check that gates when the
> timeout clock starts, rather than increasing the global timeout, since
> a larger global timeout would mask the same startup-latency problem
> instead of fixing it.

This record format does not claim to expose hidden reasoning — it is the
same level of detail a PR description or session transcript already
shows. Where a decision only restates a rule already codified in this
document (e.g. "typecheck before lint because it's cheaper"), the full
five-field record is unnecessary; the format is reserved for decisions
that depend on evidence specific to the task at hand.

### A. Reproduction **[INVARIANT]**

1. Translate the report into a concrete expected-vs-actual pair: "expected
   X given input/state Y; observed Z instead." A report that doesn't yet
   support this translation is under-specified and needs either more
   evidence gathering (logs, a failing test, a stack trace) or a targeted
   clarification question — not an assumed fix.
2. Locate the evidence: a failing test name (`Grep` for it), a CI job log
   (GitHub MCP `get_job_logs`), a stack trace's file:line references (open
   those files directly), or a screenshot/description of UI behavior.
3. Reproduce locally with the narrowest command that exercises the failure
   — a single `vitest run <file>`, not the whole suite, so the reproduction
   loop stays fast.
4. When a failure is CI/container/OS/browser-specific and won't reproduce
   locally: read the CI job's exact environment (Node version, OS image,
   env vars, service containers) from the workflow YAML and either match it
   locally (e.g. run under the same Node major version) or reason about the
   diff between environments as the hypothesis itself (see Part VIII).
5. Distinguish symptom from root cause early: does fixing the reported
   observation actually make the underlying invariant hold, or does it just
   silence the symptom (e.g. increasing a timeout instead of fixing a real
   race)? The `--memory`/`EACCES`/`HOME` fixes recorded in this repo's own
   `CHANGELOG.md` are a good internal reference for "these looked like three
   separate bugs but were symptoms of the sandbox's UID-mapping assumption
   being wrong in three different ways" — root-cause work often reveals a
   shared cause behind multiple reported symptoms.
6. Record the initial failing state verbatim (command run, exit code,
   stderr/stdout) before touching anything — this is the baseline the fix
   is checked against later, and it's also what an escalation report needs
   if the loop gets BLOCKED (Part XIV).

### B. Root-Cause Analysis **[INVARIANT]**

Trace from symptom to source by walking the call stack in the error, or, if
there is no stack, by bisecting the code path with targeted reads/greps
narrowing from "which module" to "which function" to "which line/condition."
Form a specific, falsifiable hypothesis ("this is null because the async
call above it isn't awaited") and test it directly — add a temporary log or
assertion, or re-read the exact type signature — rather than guessing at a
fix and seeing if tests pass. Eliminate false leads by confirming the
hypothesis explains *all* observed symptoms, not just one; a hypothesis that
only explains part of the failure is incomplete. Check recent commits
(`git log -p` / `git blame` on the failing region) for a regression — did
this line change recently, and does the change correlate with when the bug
was first observed?

Root cause is classified against this list — logic, state, timing/async/race,
configuration, environment, permissions, API incompatibility, dependency
update, serialization, caching/stale data, frontend state, backend state, CI
script, shell behavior, test assumption, platform-specific behavior — because
the classification determines where the fix belongs (Part IV.C) and what
validation proves it (Part IV.E). **Sufficient evidence to declare a root
cause**: the hypothesis (a) explains every observed symptom, (b) is
falsifiable and was checked against the actual code/config rather than
assumed, and (c) a fix targeting it, applied locally, turns the reproduction
from failing to passing without an unrelated change also being needed. If a
fix "works" but the mechanism isn't understood, that is not root-cause
confidence — it's a guess that happened to pass, and it must not be reported
as a diagnosed fix.

### C. Fix Design **[INVARIANT]**

Choice among minimal patch / local refactor / shared abstraction /
architectural correction / backward-compatible change / migration /
test-only correction / workflow correction / dependency pin-or-upgrade /
revert is driven by matching the *scope of the root cause* to the *scope of
the change* — a config bug gets a config fix, not a code refactor; a
genuinely duplicated pattern found while fixing one instance is worth
extracting only if the extraction doesn't expand the PR's blast radius
beyond what review can reasonably absorb in one pass. A revert is preferred
over a forward-fix when the regression is recent, the forward-fix is not yet
understood with root-cause confidence, and reverting doesn't itself have a
large blast radius.

Assessment dimensions before committing to a design: **blast radius** (how
many call sites/files change), **regression risk** (does this touch a path
with existing coverage, and does that coverage actually exercise the changed
branch), **compatibility** (public API signature changes, on-disk schema
changes), **performance**, **security** (does the fix touch an auth/secrets/
input-validation path — if so, Part IX's stop-conditions apply), 
**maintainability**, **user experience**, **future extension** (would this
fix make the *next* similar bug easier or harder to fix), and **whether the
fix belongs in the current PR at all** — a fix that's correct but unrelated
to the reported issue is scoped out and reported as a follow-up rather than
bundled in, unless it's a one-line correction directly adjacent to the real
fix (e.g. Bundle #7's audit fixing the missing `maxFiles` bound alongside
its primary finding, because both were found by the same inspection and both
are small).

### D. Implementation **[INVARIANT / SYMBOLWRIGHT]**

Files to edit are exactly the ones root-cause analysis identified — no
speculative "while I'm here" edits. Edits are sequenced from the most
foundational change outward (type/interface changes before their call
sites, so intermediate states type-check as each file lands, using
`npm run typecheck` **[SYMBOLWRIGHT]** as the sequencing checkpoint in this repo).
Existing style is matched by reading 1–2 neighboring files/functions before
writing new code — this repo's own style is enforced mechanically by
`eslint.config.js` and `prettier` (`npm run format` / `format:check`
**[SYMBOLWRIGHT]**), so "preserve style" here concretely means "the diff passes
`format:check` and `lint` without needing hand-tuning." Repository utilities
are reused instead of duplicated — e.g. this repo already has a canonical
`MISSION_EVENT_FILTERS` list; a new feature needing an event-category filter
imports it rather than re-declaring one, per the exact anti-pattern
`POST_BUNDLE7_FORENSIC_AUDIT.md`'s F1 corrected. Types, error handling,
config, tests, docs, and changelogs are updated in the same PR as the code
they describe — this repo's CHANGELOG convention (one dense bullet per
change, naming exact files/functions, under `[Unreleased]`) is followed
rather than deferred. Schema/migration changes, generated code, lockfiles,
and snapshots are only touched via their generating command (`npm install`
for the lockfile, `tsc` for `dist/`, never hand-edited) **[INVARIANT]**.

**When the first attempted fix doesn't work**: the failure output is
re-read in full (not skimmed), the hypothesis from Part IV.B is
re-examined against the new evidence — did the fix address a real but
insufficient cause, or was the original hypothesis wrong — and the next
attempt narrows rather than widens the change (adding more speculative
changes on top of a failed one compounds risk; reverting to the last known
state and re-diagnosing is usually cheaper). This is bounded: see the
autonomous repair loop discipline in Part V.G and Part XIV, which applies to
bug fixes too, not only Large PR Bundles.

### E. Validation **[INVARIANT / SYMBOLWRIGHT]**

Order and rationale, cheapest/fastest signal first:

1. **Targeted unit test** for the exact changed function — fastest possible
   signal that the fix does what's intended.
2. **New regression test** proving the original bug is caught — written
   *before* declaring the fix complete, not after, so it's confirmed to fail
   on the pre-fix code and pass on the post-fix code.
3. **Existing nearby tests** in the same file/module — catches
   collateral breakage in logic adjacent to the change.
4. **Typecheck** (`npm run typecheck` **[SYMBOLWRIGHT]**) — cheap, catches an
   entire class of errors before running anything.
5. **Lint** and **format** (`npm run lint`, `npm run format:check`
   **[SYMBOLWRIGHT]**) — style/correctness rules, cheap.
6. **Build** (`npm run build` **[SYMBOLWRIGHT]**) — confirms the change compiles
   as a package, not just as loose files.
7. **Full test suite with coverage** (`npm run test:coverage` **[SYMBOLWRIGHT]**)
   — broader regression signal; this repo enforces coverage thresholds as
   part of this command.
8. **Integration/E2E tests**, where they exist for the touched surface (this
   repo's `*.integration.spec.ts` files, e.g.
   `server-autonomy-portability.integration.spec.ts`).
9. **Security scan / dependency audit** (`npm run audit` **[SYMBOLWRIGHT]**) —
   run when the change touches dependencies or a security-sensitive path.
10. **Runtime/API/browser smoke test** — for anything with a live surface
    (an HTTP route, a UI view), exercised the way a real caller would use
    it, not only through a unit test double.
11. **CI-equivalent aggregate command** (`npm run validate` **[SYMBOLWRIGHT]** —
    audit → typecheck → lint → format:check → test:coverage → build →
    release-readiness) — the final local gate before pushing, matching what
    `ci.yml`'s `validate` job runs.

This order is chosen so a cheap, fast failure (typecheck, lint) is caught
before spending time on a slow full-suite run. **Reacting to unrelated
failures**: a failure in a file this change didn't touch is checked against
`main`/the base branch — if it fails there too, it's pre-existing and gets
noted (not silently ignored, not silently "fixed" as scope creep) rather
than blocking this PR; if it only fails on this branch, it's this change's
responsibility regardless of whether the changed line looks related.
**Repair iterations are bounded** — see Part V.G / Part XIV for the exact
retry/escalation contract, which applies uniformly to bug fixes and bundles.
**Stopping condition**: after the bounded number of repair attempts, if the
narrowest relevant check still fails, the state transitions to `BLOCKED` and
the report says exactly what's failing, what was tried, and what evidence
points to why — never a silent partial fix reported as complete.

### F. Completion **[GATE]**

A bug fix is only reported fixed when: the new regression test fails on the
pre-fix code path and passes post-fix (evidence, not assertion); the
validation ladder above has run to the level required for this task's blast
radius (Part XI's Validation Decision table gives the mapping); `git diff`
has been read in full and matches intent exactly (no stray whitespace/debug
changes); `git status` shows no unexpected untracked files; a scan for
accidental secrets/credentials in the diff has run (`Grep` for
key-shaped strings, `.env`-style filenames); no leftover debug code
(`console.log`, commented-out blocks, temporary assertions) remains; docs/
CHANGELOG are updated if the change is user-visible; and the commit/PR are
prepared per Part VI/VII. The final report states remaining risk explicitly
— e.g. "fix verified for the reported reproduction; adjacent code path X
was not exercised by any test and wasn't touched, flagging as an
out-of-scope observation" — rather than implying total coverage.

---

## Part V — Exact Large PR Bundle Workflow

### A. Request Decomposition **[INVARIANT]**

A Large PR Bundle prompt is broken into: mission objective (one sentence,
the outcome, not the mechanism), scope (what subsystems this bundle owns),
non-goals (explicitly what it will *not* do, stated even when obvious, so
scope creep has a written boundary to be checked against), user stories
(who does what and why), functional requirements (observable behavior),
non-functional requirements (performance, reliability, security bounds),
architectural requirements (what must compose with what already exists),
security requirements, compatibility requirements (what must keep working),
UX requirements, test requirements, documentation requirements, release
requirements (what gate must pass before merge), and explicit acceptance
criteria derived from all of the above. Conflicting requirements (e.g. "make
this always-on" vs. "must be feature-flaggable") are surfaced and resolved
by asking which invariant is load-bearing — usually the safety/compatibility
requirement wins over convenience, and the resolution is stated in the
design doc rather than silently picked.

### B. Existing-State Audit **[INVARIANT — the single highest-leverage step
for a Large PR Bundle in a repository with this much prior autonomy work]**

Before any design, determine: what already exists (read the relevant
`docs/autonomy/*.md` and `Grep` the module names the mission implies), what's
partially implemented (a module with a `.ts` file but no wiring into a live
route — check callers, not just existence), what's scaffolding vs. real (a
function that returns a hardcoded value or empty array where real logic is
implied — this is exactly the class of defect `POST_BUNDLE6_FORENSIC_AUDIT.md`
and `POST_BUNDLE7_FORENSIC_AUDIT.md` exist to catch), what's duplicated,
what's broken, what should be reused vs. deleted vs. migrated, which prior
bundles are relevant (`git log --oneline` scanned for `Bundle #N` commit
titles), and whether the requested feature already exists under a different
name (grep for the *behavior*, not just the requested name — e.g. "rollback"
in this repo is called "restore to pre-repair content" inside
`persistent-mission-repair-controller.ts`). **Preventing a second
implementation beside an existing one** is enforced procedurally: no new
module is created for a capability without first grepping for its concrete
behavior across the whole `src/` tree and reading any doc whose title
plausibly overlaps.

### C. Architecture and Design **[INVARIANT]**

A design is produced covering: component boundaries and module ownership
(which existing directory owns the new logic, or whether a new one is
justified), data models, interfaces/API contracts, events (this repo's
mission event stream is the concrete example — new event types get a
`type` string and a summary, following `mission-events.ts`'s existing
shape), persistence model, state transitions, error model, retry behavior,
rollback behavior, resume behavior, concurrency model, transaction
boundaries, security model, permission model, observability, configuration,
feature flags, backward compatibility, migration plan, testing strategy, and
deployment implications. A **formal written design** is produced (as a doc,
or as the plan-mode plan file in this session's own environment) whenever
the bundle spans more than ~3 files or introduces a new persisted state
shape; a small, single-module feature addition can go straight to
implementation with the design held implicitly and verified via `git diff`
review at the end instead.

### D. Task Graph and Sequencing **[INVARIANT / SYMBOLWRIGHT example order]**

Each task in the graph is assessed for: dependencies (what must exist
first), blocking relationships, safe parallelism (independent files with no
shared interface can be edited in either order), risk, its own validation
point, a rollback point (a commit boundary cheap to revert to), and whether
it belongs in this PR at all versus a follow-up. Typical order in this
repository, matching how Bundle #5/#6/#7 actually shipped per `git log`:

1. Types and contracts (`*-types.ts`, shared interfaces).
2. Core domain model (the module owning the new logic, e.g. under
   `src/autonomy/` or `src/mission/`).
3. Persistence (atomic on-disk store shape, following `mission-store.ts`'s
   pattern).
4. Services (orchestration logic calling the domain model).
5. APIs (`src/app/api/*-routes.ts`).
6. Runtime orchestration (wiring into `createServerAutonomyRuntime` or the
   equivalent live-path constructor — the step
   `POST_BUNDLE7_FORENSIC_AUDIT.md` exists specifically to verify actually
   happened).
7. UI (`src/app/views/*.ts`).
8. Tests (colocated `*.spec.ts`, though in practice tests are written
   alongside each of steps 1–7, not deferred to the end — deferring test
   writing to a final pass is a known way to end up with untested edge
   cases the implementer already stopped thinking about).
9. CI (workflow YAML changes, only if a new validation command needs
   wiring in).
10. Documentation (`docs/`, `README.md`, `CHANGELOG.md`).
11. Final integration (the end-to-end proof step, e.g. Bundle #6's release
    integration tests building a full temporary workspace).

**When the actual order differs**: tests are usually interleaved with steps
2–7, not batched at step 8, specifically to keep the validation ladder
(Part V.F) meaningful throughout rather than only at the end; and step 6
(runtime orchestration wiring) sometimes needs to happen *before* step 5 if
the API route is a thin pass-through and the real complexity is in whether
the runtime constructor actually reaches the new code path — exactly the
gap Bundle #7's audit was written to check for.

### E. Multi-File Editing **[INVARIANT]**

The file set is planned before the first edit (from the task graph above).
Internal consistency is maintained by editing in dependency order (types
before their consumers) and running `npm run typecheck` **[SYMBOLWRIGHT]** after
each slice rather than only at the end, so a broken import or a renamed
symbol is caught within one edit's blast radius instead of accumulating.
Renamed symbols are tracked by `Grep`ping the old name across the whole tree
before considering a rename complete — a partially migrated call site (some
callers updated, others not) is the single most common Large-PR-Bundle
defect class, and it's caught by this grep, not by hoping the compiler
catches every case (it won't catch renamed string literals, JSON keys, or
event-type strings). Circular dependencies are avoided by keeping the
dependency direction matching the task-graph order above (domain model never
imports from its own API layer). Cross-language changes don't apply to this
single-language repository today, but the general rule — verify each
language's own toolchain independently rather than assuming a passing
TypeScript compile says anything about a co-located script in another
language — is the same principle Bundle #7's portability layer encodes for
*target* repositories it validates. **Recovering from a failed or incomplete
edit session**: `git diff` is read section by section to reconstruct exactly
what's in flight; a half-applied multi-file change is either completed
(preferred, if the remaining work is well understood) or fully reverted
file-by-file (`git checkout -- <file>` **[AUTH-REQUIRED framing: only ever
targets files this same session wrote, never a file with pre-existing
uncommitted user changes]**) rather than left partially applied. `git diff`
is used continuously during implementation, not only at the end — reading it
after each logical slice is how style drift, accidental unrelated edits, and
incomplete migrations get caught while they're still cheap to fix.

### F. Continuous Validation During the Bundle **[INVARIANT / SYMBOLWRIGHT]**

After each logical slice: targeted test for the slice, `npm run typecheck`.
After a few slices land together (e.g. domain model + persistence): `npm run
lint`, a broader targeted test run. Before considering any major section
(e.g. "the API layer") done: a build (`npm run build` **[SYMBOLWRIGHT]**) and
the integration tests touching that layer. Full suite (`npm run
test:coverage`) and the aggregate `npm run validate` **[GATE]** run at least
once before the bundle is reported complete, and again after the final diff
audit if any last-mile fix touched code after that run. This checkpoint
cadence is what prevents a bundle from accumulating unvalidated changes: no
more than one "logical slice" (task-graph node) is ever implemented without
its own typecheck+targeted-test pass before starting the next.

### G. Autonomous Repair Loop **[INVARIANT — this is the load-bearing
discipline of the whole process]**

For every failed validation step:

1. **Capture** the exact command, its exit code, and its full stdout/stderr
   — not a paraphrase.
2. **Identify the first meaningful failure** — in a multi-error output, the
   first error is usually the root cause; later errors are often cascades
   from it (a missing import breaks every downstream reference).
3. **Classify** the failure against Part XI's Failure Classification table
   (type error, test assertion, lint rule, build failure, flake, timeout,
   environment mismatch…).
4. **Locate the responsible code** — the file/line the error names, or, for
   a cascading failure, the file/line the *first* error names.
5. **Decide new-work vs. pre-existing** — re-run the same check against the
   base branch (or check whether the failing file was touched by this
   change at all); a pre-existing failure is documented, not silently fixed
   as scope creep, unless fixing it is a one-line prerequisite for this PR.
6. **Apply a focused repair** — the smallest change that addresses the
   classified cause, not a broad rewrite.
7. **Re-run the narrowest useful check** that exercises the fix (the single
   failing test, not the whole suite).
8. **Re-run broader validation** once the narrow check passes, to confirm
   no new breakage was introduced by the repair itself.
9. **Record the repair attempt** — what failed, what was tried, what
   changed — so the eventual report has a real trail, and so a repeat of the
   same failure after a "fix" is recognizable as the same issue rather than
   treated as new.
10. **Stop at success, or at a defined retry boundary [GATE]**: this process
    caps focused repair attempts at a small bounded number per failure
    (in practice: try the direct fix; if it doesn't resolve the check, try
    one alternative diagnosis; if that also fails, stop and escalate) —
    autonomous retries are never unbounded. Hitting the boundary transitions
    the task to `BLOCKED` (Part XIV) with the full evidence trail from steps
    1–9 in the report, not a silent abandonment or a repeated identical
    retry.

**Avoiding random edits and test-chasing**: every repair is justified by the
classification in step 3 and the location in step 4 — a change made without
being able to state which specific error it addresses is not a valid repair
attempt. If two consecutive attempts at the same failure are both
unprincipled ("try changing this and see"), that itself is the signal to
stop and re-diagnose from the raw output again rather than attempt a third
guess.

### H. Integration and End-to-End Verification **[GATE]**

A bundle is not verified by its unit tests alone. Confirmation runs through
the **same path a real user/operator would use**: for an API-backed feature,
that means hitting the real route (or the closest integration test that
constructs the real runtime, matching how `POST_BUNDLE7_FORENSIC_AUDIT.md`'s
"Verification trial" re-traces `mission-routes.ts` → `createServerAutonomyRuntime`
→ … by reading the real, non-test source rather than trusting a mock's
behavior). Explicit anti-patterns checked for before completion: no fake
production files (a file that looks wired in but is dead code), no
placeholder implementations returning stubbed data on a path a doc claims is
real, no dead UI controls, no UI claiming a capability the backend doesn't
actually provide, no API route left unregistered on the actual router, no
runtime tool left out of the actual tool registry, no orphaned config
options nothing reads, no unused persisted fields, no untested migration,
no feature that only works via a developer-only shortcut not exposed to a
normal caller, and no manual step required that isn't documented as such.
This is precisely the audit discipline `POST_BUNDLE6_FORENSIC_AUDIT.md` and
`POST_BUNDLE7_FORENSIC_AUDIT.md` apply after the fact — this section is that
same discipline applied *during* implementation, before merge, so a
post-bundle forensic audit ideally finds nothing.

### I. Bundle Completion Standard **[GATE]**

A Large PR Bundle is complete only when: every acceptance criterion from
Part V.A is met and individually checkable; every file in the task graph is
implemented (no partial slice left half-wired); tests are added and passing
for every new behavior; the full validation ladder (Part IV.E, extended by
Part V.F/H) passes; coverage impact has been reviewed (did the change lower
the aggregate coverage the CI threshold enforces); documentation is updated
(new `docs/*.md`, README index entry if foundation-level, CHANGELOG entry);
migration/upgrade instructions are written if any persisted shape changed;
no placeholders remain; no known regressions remain unaddressed or
undocumented; no unexplained validation failures remain; no requirement from
Part V.A was silently dropped; `git status` is clean of anything
unintentional; the final `git diff` has been read end-to-end by the same
session that wrote it; and the PR title, summary, test evidence, and
risk/follow-up notes are prepared per Part VII.

---

## Part VI — Git and Branch Management

**[SYMBOLWRIGHT]** for this session's concrete decisions, **[INVARIANT]** for the
underlying rules.

- **Base branch**: identified as `main` (confirmed via `git branch -a`
  showing `remotes/origin/main`, and `ci.yml`'s `push: branches: [main]`).
- **Fetch/pull**: `git fetch origin <branch>` is used when remote state
  might have moved since the session started (a designated branch that
  already exists remotely, as this one did); a blind `git pull` on a branch
  with local uncommitted work is avoided in favor of fetch-then-inspect.
- **Feature branch creation**: only when the designated branch doesn't
  already exist — checked first (`git branch -a`), since this session's
  branch (`claude/agent-forensic-process-docs-2hxedg`) already existed both
  locally and on `origin`, so no creation step ran.
- **Branch naming**: dictated by the task's explicit instruction when given
  (as it was here); otherwise a short, hyphenated, purpose-describing name.
- **Handling an existing user branch / avoiding overwriting user changes
  [INVARIANT, GATE]**: `git status` is checked before any edit; any
  uncommitted change not authored this session is preserved (stashed with
  `-u` or left alone), never discarded, per this environment's standing
  safety rules.
- **Staged/unstaged inspection**: `git status` and `git diff`/`git diff
  --staged` are read before every commit, not assumed from memory of what
  was edited.
- **Untracked files**: reviewed individually before `git add`; only the
  files the task actually intends to change are added by explicit name
  (`git add docs/autonomy/AGENT_FORENSIC_PROCESS_DOCUMENTATION.md README.md
  CHANGELOG.md` for this session), never `git add -A`/`.`.
- **Commit cadence during long tasks**: one commit per logically complete,
  independently reviewable unit of work — for this documentation-only task,
  a single commit covering the new doc plus its two index-entry edits is
  appropriate because they're one coherent change; a multi-slice Large PR
  Bundle instead commits per task-graph node, so a reviewer (or a future
  `git bisect`) can see the sequence.
- **Commit message structure**: imperative summary line under ~72 chars,
  `type(scope): summary` where the repo's own history uses that convention
  (`feat(agent): …`, `fix(autonomy): …`, `docs(autonomy): …` — confirmed by
  scanning recent `git log` titles), followed by a body only when the
  summary alone doesn't carry the "why."
- **Amend vs. new commit [INVARIANT]**: default is a new commit; amending is
  reserved for genuinely fixing the immediately-prior commit before it's
  been pushed/reviewed, and never used to paper over a hook failure (a
  failed pre-commit hook means the commit didn't happen at all, so the fix
  goes into a fresh commit, not an amend of a commit that never landed).
- **Rebase / merge base branch / conflict resolution**: rebasing onto or
  merging the base branch is done when the branch has fallen behind and a
  conflict-free (or resolvable) integration is possible; conflicts are
  resolved by understanding both sides' intent, never by blindly picking
  one side or discarding either.
- **Force-push policy [AUTH-REQUIRED]**: never used without an explicit,
  current, in-scope user instruction — this session performs a normal
  `git push -u origin <branch>`, not a force-push, since the branch's
  existing history is exactly this session's own prior work continued.
- **Push verification**: after push, `git status` (and, where available,
  the GitHub MCP tools) confirm the remote ref matches local `HEAD`.
- **Draft vs. ready-for-review PR**: opened as **draft** by default per this
  environment's standing instruction, unless the user explicitly asks for a
  ready-for-review PR.
- **When this process refuses to commit or push [GATE / AUTH-REQUIRED]**: a
  dirty worktree containing changes this session didn't make, a failing
  mandatory validation gate, an unresolved merge conflict, or any action
  that would need a force-push/history-rewrite without explicit
  authorization all block a commit/push until resolved or explicitly
  authorized.
- **Dirty worktree not authored this session**: investigated (what changed,
  when, by what process) before deciding whether it's in-progress work to
  preserve or leftover state; never overwritten reflexively.

**Final Git checks run before publication [GATE]**: `git status` shows
exactly the intended files as clean/committed; `git diff <base>...HEAD
--stat` (or the staged diff, pre-commit) lists only the intended files;
`git log -1` shows the expected commit message and no accidental extra
commits; the push succeeded and the remote branch matches local `HEAD`.

---

## Part VII — Pull Request Construction

### Bug fix template

```markdown
## Summary
- <one-line statement of what was broken and what this PR does about it>

## Root cause
<the diagnosed mechanism, in the same specific, symbol-and-file-named style
as this repo's CHANGELOG entries — not "there was a bug," but "X did Y
because Z, which is visible at file:line">

## Changes
- `path/to/file.ts`: <exact change and why>
- `path/to/file.spec.ts`: <new regression test proving the fix>

## Validation
- [ ] Targeted regression test added and confirmed to fail pre-fix / pass post-fix
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm test` / `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm run validate` (aggregate gate)

## Compatibility / risk
<any behavior change a caller could observe, and any known residual risk>

## Issue linkage
Fixes #<issue>, if applicable
```

### Large PR Bundle template

```markdown
## Summary
- <2-3 bullets: the mission objective and what shipped>

## Problem / motivation
<why this bundle exists, what gap it closes>

## Architecture
<component boundaries, how new pieces compose with existing subsystems —
name the existing modules being extended, not just the new ones, to make
the existing-state audit visible to reviewers>

## Implementation details
- `path/...`: <what changed and why, one bullet per file or tight file group>
- ...

## User-visible effects
<what an operator/user can now do that they couldn't before, described
through the real path they'd use it from — an API route, a CLI command, a UI
view — not just "logic was added">

## Test plan
- [ ] New unit/contract tests for each new module
- [ ] Integration/end-to-end proof exercising the real live path
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm run validate`

## Migration / compatibility notes
<any persisted-state shape change, and how existing data is handled>

## Security considerations
<any new surface, and how it's gated>

## Risk assessment / rollback plan
<blast radius, and how to revert cleanly if something's wrong post-merge>

## Follow-ups
<explicitly named out-of-scope items deferred, so scope loss is visible
rather than silent>

## Safety checklist
- [ ] No secrets or credentials in code
- [ ] No breaking changes to public API (or breaking changes called out above)
- [ ] Coverage thresholds still met
```

**[SYMBOLWRIGHT]**: this repo's actual `.github/pull_request_template.md` is
shorter (`Summary` / `Changes` / `Test plan` with four fixed checkboxes /
`Safety checklist` with three fixed checkboxes) — the templates above are a
superset used to structure the PR body's *content*; the repository's own
template's literal checkbox items are always included verbatim so the
template's contract is satisfied, with the richer sections layered around
them.

---

## Part VIII — CI Failure Handling

Workflow when a PR shows red: inspect the checks list (GitHub MCP
`pull_request_read`/`actions_list`) to find which job failed; pull that
job's logs (`get_job_logs`) rather than guessing from the check name alone;
read the log for the **first** actionable error — later output in a CI log
is very often cascade noise from the first failure (a compile error breaks
every subsequent step that depended on the build artifact). Distinguish a
real failure from a cascading one by checking whether later "failures" are
just "previous step failed, so this step never ran" markers.

Reproduce locally by running the exact same command the CI step runs
(`.github/workflows/ci.yml`'s own step commands are copy-pasted, not
approximated). Account for environment differences explicitly: Node version
(`ci.yml` pins Node 22 via `actions/setup-node`), OS (`ubuntu-24.04`),
shell (`bash` by default in Actions), environment variables and secrets
(a failure that only reproduces in CI may depend on a secret this local
session doesn't have — check the workflow's `env:`/`secrets:` blocks),
permissions (`permissions: contents: read` at the workflow level — a step
needing write access would fail here first), service containers (none
declared in this repo's `ci.yml` today, but would need matching if added),
test ordering (a test relying on shared mutable state can pass in isolation
and fail in full-suite order), timing (CI runners are typically slower/more
contended than local — this repo's own CHANGELOG documents raising a test
timeout from 5000ms to 15000ms for exactly this reason), and resource limits
(the sandbox's own `--memory`/`--cpus` bounds are a documented past source
of CI-only OOM failures in this exact repo).

Category-specific fixes: **formatting** → `npm run format` locally, commit
the result (never hand-format to match). **Lint** → fix the flagged rule at
its root cause, not a blanket disable comment, unless the rule is genuinely
a false positive (then a narrowly-scoped, justified `eslint-disable` on the
single line). **Typecheck** → fix the type, don't cast to `any` to silence
it. **Unit test failures** → Part IV.B/G apply directly. **Coverage
threshold** → add the missing test for the uncovered branch rather than
lowering the threshold **[AUTH-REQUIRED to lower a threshold]**. **Build
failures** → almost always a typecheck-adjacent issue or a missing export;
same diagnosis path as typecheck. **Dependency audit failures**
(`npm run audit`) → identify the vulnerable transitive dependency, prefer a
version bump that resolves it over an audit-ignore **[AUTH-REQUIRED to add
an audit exception]**. **Deployment failures** → out of scope for a docs/code
PR unless the task specifically touches `deploy.yml`/`Dockerfile`. **Flaky
tests** → re-run once to confirm flakiness before treating it as a real
failure; if confirmed flaky, the fix is to remove the non-determinism (fixed
clock/seed, awaited async boundary), not to retry-loop around it or delete
the test **[AUTH-REQUIRED to delete/skip a test outright]**. **Timeouts** →
raise only with a concrete justification tied to real measured slowness
(matching the documented precedent above), not as a reflexive fix. **Artifact
upload failures** → check the workflow step's path/name matches what the
prior step actually produced. **GitHub Actions YAML syntax failures** →
validate indentation/keys against the working steps already in the file
rather than guessing syntax.

**After the first green run**: re-run is not automatically repeated just to
"be sure" (wasteful), but if the fix touched anything timing-sensitive or
previously flaky, a second run is worth triggering before treating the PR
as stably green, and this is noted in the PR thread rather than assumed
silently.

---

## Part IX — Safety, Security, and Change Control

**[INVARIANT]** unless noted. **Secret detection**: before any commit, the
diff is scanned for key-shaped strings, `.env`-style filenames, and
anything that looks like a credential; a suspicious match is investigated
before staging, even if the filename looks innocuous. **Credential
handling**: credentials are never logged, never hardcoded, never committed
— environment variables and this repo's own provider-key/app-key boundary
(`docs/PROVIDER_KEYS.md`) are respected rather than worked around.
**Dangerous shell commands**: destructive flags (`rm -rf`, `git clean -f`,
`git reset --hard`, force-push) are **[AUTH-REQUIRED]** — never run on
session-default authority. **Database changes / migrations**: reviewed for
whether they're reversible and whether existing data is preserved before
applying. **Production deployment risk**: this session's task never touches
deploy surfaces; had it, `deploy.yml` and any manual-approval gate it
defines would be respected as a hard stop pending explicit authorization.
**Dependency/supply-chain risk**: a new dependency is only added when
necessary, from a reputable source, and is run through `npm run audit`
before being considered safe to ship. **Permission/authentication/
authorization changes**: treated as high-blast-radius by default — reviewed
against this repo's own `docs/governance/SYMBOLWRIGHT_PERMISSION_MODEL.md` and
`SYMBOLWRIGHT_THREAT_MODEL.md` when a change touches that surface. **Input
validation, path traversal, command injection, SSRF, XSS, CSRF, unsafe
deserialization**: this repo already encodes hard invariants against several
of these classes concretely (e.g. `isSafePortableValidationCommand`
rejecting shell metacharacters, `resolvePortableValidationRoot` rejecting
paths that resolve outside the repo root) — any new code touching a
similar boundary is checked against the *same* class of invariant rather
than inventing a weaker one. **Logging sensitive data**: log statements are
checked for accidentally including secrets, tokens, or full credential
objects. **Breaking public API changes**: called out explicitly in the PR
body (Part VII), never shipped silently. **Data-loss risk / rollback
planning**: any change to a persisted-state shape includes a stated
rollback/migration path.

**When this process stops instead of proceeding [GATE]**: a request implies
a destructive or hard-to-reverse action without prior explicit authorization
in this exact scope; a change would touch credentials, auth, or a declared
security-sensitive path in a way whose safety isn't yet understood with
confidence; a validation gate cannot be made to pass within the bounded
repair budget; or evidence suggests the repository state itself
(uncommitted work, unexpected branch contents) isn't fully understood yet.
In every one of these cases the response is to report the blocker with
evidence, not to proceed on a guess.

---

## Part X — Tool-by-Tool Operational Record

| Tool/command | Used for | When used | Output that matters | Failure means | Next action |
| --- | --- | --- | --- | --- | --- |
| `pwd` / cwd check | Confirm working directory | Start of session, after any `cd` | Absolute path | Wrong directory | Navigate to correct root before anything else |
| `ls` | Orient in a directory | Repo root intake, before creating a new file/dir | File/dir listing | Expected structure missing | Re-verify target repo |
| `find` / `Glob` | Locate files by name/pattern | "Does X exist," "find all `*.spec.ts` near Y" | Matching paths | No matches | Either the thing doesn't exist yet (safe to create) or the search pattern is wrong (widen it) |
| `tree` | Rare; broad structural overview | Only for genuinely unfamiliar large trees | Directory tree | N/A | Informs Part III's mental model |
| `git status` | Working-tree state | Constantly — before/after every edit batch | Clean/dirty, branch name, staged/unstaged/untracked | Unexpected dirt | Investigate before any further git op |
| `git branch -a` / `--show-current` | Branch identity | Intake, before first commit | Local + remote branches | Wrong/missing branch | Switch or create the designated branch |
| `git log --oneline -N` | Recent history, message idiom | Intake | Commit titles | N/A | Match message style; spot in-flight related work |
| `git diff` / `git diff --staged` | Exact change content | Continuously during implementation, and always pre-commit | Unified diff | Unintended changes present | Revert/adjust before staging |
| `git show <sha>` | Inspect a specific past commit | Investigating a regression | Full commit diff | N/A | Confirms/refutes a regression hypothesis |
| `git blame` | Who/when/why a line exists | Root-cause analysis on unfamiliar code | Commit + author per line | N/A | Points at the commit to `git show` next |
| `rg`/`Grep` | Find symbol/string usage repo-wide | Constantly — call-site analysis, duplicate-detection, secret scan | Matching lines with file:line | No matches where expected | Symbol may be dead, renamed, or not yet wired in |
| `sed`/`Edit` | Apply a precise text change | Every code/doc edit | N/A (tool succeeds/fails) | Old string not found/not unique | Re-read the file; the assumed content was stale |
| `cat`/`Read` | Read full file content | Before every edit to a file not yet read this session | File content | N/A | Required prerequisite for `Edit` in this environment |
| `jq` | Query JSON output/config | Inspecting `package.json`, tool JSON output | Extracted fields | Malformed JSON | Investigate the JSON source |
| Package-manager commands (`npm ci`/`npm install`) | Install/sync dependencies | Only when a manifest/lockfile changes | Install success/failure | Lockfile drift, network failure | Fix the manifest change or resolve conflicting versions; never hand-edit the lockfile |
| Test commands (`npm test`, `vitest run <file>`) | Prove behavior | Part IV.E / V.F | Pass/fail per test, coverage | Failing assertion | Part IV.B/V.G repair loop |
| Typecheck (`npm run typecheck`) | Static type correctness | After every implementation slice | Compiler errors with file:line | Type error | Fix the type, don't suppress it |
| Lint (`npm run lint`) | Style/correctness rules | Before commit | Rule violations | Violation | Fix at root cause; scoped disable only if a genuine false positive |
| Format (`npm run format:check` / `format`) | Consistent formatting | Before commit | Diff of unformatted lines | Formatting drift | Run `npm run format`, re-check |
| Build (`npm run build`) | Compiles as a real package | Before considering a slice/bundle done | Build success/failure | Compile error not caught by typecheck alone (rare) | Same diagnosis path as typecheck |
| Coverage (`npm run test:coverage`) | Full-suite + coverage gate | Before `npm run validate` | Pass/fail, coverage % vs. threshold | Below threshold | Add the missing test, never lower the threshold without authorization |
| GitHub MCP tools (`pull_request_read`, `list_pull_requests`, `create_pull_request`, `get_job_logs`, `subscribe_pr_activity`, …) | All GitHub interaction | PR/issue/CI inspection, PR creation, CI-failure follow-up | Structured PR/issue/CI data | API error/auth failure | Report the blocker; never fall back to guessing GitHub state |
| CI log inspection (`get_job_logs`) | Diagnose a red check | Part VIII | Raw job log text | N/A | Locate first actionable error |
| Browser/runtime validation | Confirm a UI/feature actually works | Any UI-touching change, before declaring done | Rendered behavior matches spec | Broken/missing behavior | Fix and re-verify through the same path |
| API calls (direct HTTP, where relevant) | Exercise a route the way a real caller would | Feature verification, Part V.H | Response matches contract | Wrong status/shape | Fix the route or its wiring |
| Container commands (`docker ...`, sandbox runner) | Isolated command execution this repo's own autonomy runtime uses | Only when the task itself concerns the sandbox/portability subsystem | Exit code, bounded stdout/stderr | Non-zero exit, `ERROR` with denial reason | Diagnose per the failure's stated reason; never bypass the sandbox's no-host-fallback invariant |
| DB/migration commands | Schema change application | Only if the task introduces a persisted schema change | Migration success/failure | Migration failure | Fix and re-apply; never hand-edit committed data |

---

## Part XI — Decision Tables

### 1. Fix Scope Decision

| Situation | Evidence | Recommended change type | Validation required | PR size |
| --- | --- | --- | --- | --- |
| Single wrong value/condition, no design implication | One failing test, one clear root cause | Minimal patch | Targeted test + typecheck/lint | Tiny |
| Same wrong pattern repeated in 2-3 nearby call sites | Grep shows duplication at the root-cause site | Local refactor extracting shared logic | Targeted tests for all call sites + full suite | Small |
| Pattern duplicated across many modules, actively causing bugs | Multiple historical fixes for the "same" bug in different files (check `git log`) | Shared abstraction | Full suite + integration | Medium |
| Root cause is a wrong foundational assumption (e.g. UID mapping, as this repo's own sandbox history shows) | Multiple seemingly-unrelated symptoms trace to one assumption | Architectural correction | Full validation ladder + real environment reproduction | Medium–Large |
| Regression from a recent, not-yet-understood change | `git blame`/`git log` pinpoints the commit; forward-fix mechanism unclear | Revert | Confirm reproduction disappears post-revert | Tiny |
| Bug is actually in test expectations, not runtime code | Reproduction shows runtime behavior is correct per spec; test asserts something else | Test-only correction | Targeted test suite | Tiny |
| Failure is purely in CI script/workflow, not app code | Local reproduction of the *application* passes; only the workflow step fails | Workflow correction | Re-run the CI job | Tiny |
| Root cause is a dependency's known bug/incompatible version | Changelog/issue tracker of the dependency confirms it | Dependency pin or upgrade | Full suite + audit | Small |

### 2. Validation Decision

| Change type | Minimum targeted checks | Required full checks | Optional checks | Release blockers |
| --- | --- | --- | --- | --- |
| Docs-only | Proofread for structural completeness; `git diff` review | None (no `src/` touched) | Markdown structure self-check | Clean diff, no stray edits |
| Tiny bug fix | New regression test, typecheck | Full test suite, lint, format | Build | Regression test passes; no unrelated failure introduced |
| Local refactor | Tests for all touched call sites | Full suite, typecheck, lint, build | Coverage review | No behavior change proven by full suite parity |
| Feature (single module) | New unit tests, typecheck | Full suite, lint, format, build | Integration test if a live route is touched | `npm run validate` green |
| Large PR Bundle | Per-slice targeted tests + typecheck (continuous) | Full suite, lint, format, build, integration/E2E, `npm run validate` | Manual smoke test of the real path | All of Part V.I |
| CI-only repair | Reproduce the exact CI command locally | Re-run the specific job to green | Second run if timing-sensitive | Job green twice if previously flaky |
| Security hotfix | Targeted regression test proving the exploit path is closed | Full suite, audit, lint, typecheck, build | Manual adversarial input test | All standard gates + explicit security sign-off note in PR |

### 3. Failure Classification

| Failure category | Typical symptoms | Evidence source | First action | Escalation path |
| --- | --- | --- | --- | --- |
| Logic error | Wrong output for valid input | Failing unit test assertion | Re-read the function against its spec/test name | Part IV.B root-cause loop |
| State/timing/race | Intermittent failure, passes in isolation | Flaky CI, non-deterministic local repro | Re-run to confirm nondeterminism | Identify the unsynchronized boundary; fix, don't retry-loop |
| Configuration | Works locally, fails in CI/other env | Diff between local and CI config/env vars | Compare `.env`/workflow `env:` blocks | Align config or document the intentional difference |
| Environment/permissions | `EACCES`, `EPERM`, path-not-found only in one environment | CI log vs. local run | Check UID/permission model (this repo's own sandbox history is the reference case) | Fix the resolution logic, not just the symptomatic path |
| API incompatibility / dependency update | Previously-working call now throws/type-errors | Changelog of the updated dependency | Pin/adjust to the new contract | Version bump + full suite |
| Serialization/caching/stale data | Data looks "old" or malformed after a known-good write | Compare persisted JSON to expected shape | Trace the exact read/write path | Fix the write's atomicity or the read's cache invalidation |
| Frontend/backend state mismatch | UI shows stale/wrong data despite correct API response | Compare rendered DOM/state to API payload | Trace the view's state-update path | Fix the missing re-render/subscription |
| CI script / shell behavior | Fails only inside the Actions runner | Raw job log | Reproduce the exact step command locally | Part VIII |
| Test assumption | Test itself encodes wrong expected behavior | Reproduction shows runtime is actually correct | Re-read the spec/requirement the test claims to assert | Fix the test, note why in the commit |
| Platform-specific | Fails on one OS/Node version only | Matrix job (`node-compatibility.yml`) log | Reproduce under that specific version | Guard or fix the platform-dependent code |

### 4. Large PR Bundle Risk

| Risk | Detection method | Prevention | Recovery | Completion evidence |
| --- | --- | --- | --- | --- |
| Duplicate implementation beside an existing one | Existing-state audit (Part V.B) grep for behavior, not just name | Always audit before designing | Consolidate into the existing implementation, delete the duplicate | Grep shows exactly one implementation of the capability |
| Fake/placeholder scaffolding claimed as real | Trace the real (non-test) call chain end to end, as `POST_BUNDLE7_FORENSIC_AUDIT.md`'s "Verification trial" does | Wire and verify each slice through its real caller before moving on | Wire it for real, or remove the claim | Live-path trace confirms the route/tool/UI control is reachable |
| Partially migrated call sites after a rename | Grep the old symbol name repo-wide | Grep immediately after any rename, before moving on | Finish the migration or revert the rename | Zero remaining references to the old symbol outside history |
| Observability gap (new events/state invisible in existing UI) | Manually exercise the UI filter/view the new state should appear in | Extend shared canonical lists (e.g. `MISSION_EVENT_FILTERS`) instead of hardcoding a second copy | Add the missing bucket/wiring; add a regression test asserting the render/filter path | UI shows the new state under the same view a real operator would use |
| Unbounded resource use in a new discovery/walk routine | Compare against a sibling routine's existing bound (e.g. `maxFiles`) | Apply the same bound new code's sibling already enforces | Add the missing bound | Bound present and covered by a test |
| Validation/repair loop silently weakened by "helpful" retries | Review repair-loop code/config for retry ceilings | Hard-code and test a bounded retry ceiling | Add/restore the ceiling; add a test asserting it's enforced | A test proves the loop reaches `BLOCKED`/failure after N attempts, not infinite retry |
| Scope loss (a required Part/requirement silently dropped) | Checklist every acceptance criterion against the final diff | Keep the decomposed requirement list (Part V.A) visible through implementation | Re-add the missing piece before reporting complete | Every acceptance criterion maps to a concrete diff hunk or test |

---

## Part XII — Worked Example: Existing Issue

*(Realistic simulation grounded in this repository's verified architecture
and its own documented incident class — the sandbox-runner environment bugs
recorded in `CHANGELOG.md`. Presented as a hypothetical walkthrough of the
process, not a claim that this exact bug is currently present. Invented
scenario details — the specific bug report, its exact reproduction, and the
specific fix — are marked **[SCENARIO]**; everything else (file names,
function names, prior incident shape, repo conventions) is **[VERIFIED]**
against the real repository.)*

**User request [SCENARIO]**: "`npm run preflight` intermittently reports a
validation command as `ERROR` with no useful message when run inside the
Docker sandbox on a fresh checkout, even though the same command passes
when run directly on the host."

### Intake

`git status` — clean, on the designated branch **[VERIFIED procedure]**.
`Read package.json` scripts — confirms `preflight` maps to
`node dist/cli.js preflight` **[VERIFIED]**. Task classified (Part I) as
**existing defect**, blast radius likely confined to the sandbox
subsystem.

### Repository discovery

`Grep` for `DockerPortableValidationRunner` and the sandbox runner locates
the execution path (`src/sandbox/`, per Part II/III); `Read` the runner
file's Docker invocation flags **[VERIFIED — these are real modules this
session inspected]**.

### Requirement analysis

Explicit requirement: the `ERROR` result must become either a real pass or
a specific, actionable failure reason. Implied requirement: the fix must
not change behavior for the (working) host-execution path. Acceptance
criterion: a new regression test reproduces the bug pre-fix and passes
post-fix.

### Reproduction

> **Evidence**: running `node dist/cli.js preflight <changed-file>`
> against a fresh checkout inside the Docker sandbox returns `ERROR` with
> a generic reason string; running the identical underlying shell command
> directly on the host succeeds.
> **Decision**: this is sandbox-specific, not a defect in the validation
> command itself — the discrepancy is between the two execution paths, not
> in what's being validated.
> **Action**: re-run the sandboxed command with the runner's existing
> verbose/debug output (if any) captured, and diff the sandbox's `--user`/
> `--env` flags against the ones a passing prior run used.
> **Result**: reproduces reliably on a *fresh* checkout, not on a checkout
> reused from a prior successful run — narrowing the variable to something
> that differs specifically about a fresh checkout's ownership/UID.
> **Next decision**: root-cause analysis should start from the UID/HOME
> resolution path, since that's what changes between a fresh and a reused
> checkout.

### Root-cause analysis: competing hypotheses

- **Hypothesis A**: the validation command itself is nondeterministic
  (flaky). **Rejected** — the reproduction above is deterministic given a
  fresh checkout; flakiness would not correlate this cleanly with
  checkout freshness.
- **Hypothesis B**: a resource limit (`--memory`/`--cpus`) is too low for
  a cold cache. **Considered** — this repo's own `CHANGELOG.md` documents
  exactly this class of failure previously (the `512m`→`2048m` raise).
  Checked first because it's cheap to check: the runner's current default
  already reflects that fix, and the reproduction's error text doesn't
  match an OOM signature. **Rejected** for this scenario, but the check
  itself was necessary before ruling it out.
- **Hypothesis C**: a container-user/`HOME` resolution mismatch on a
  fresh checkout whose ownership differs from the container's built-in
  user. **Selected** — matches `resolveDefaultSandboxUser()`'s documented
  purpose (`src/sandbox/`) and the exact incident shape this repo's own
  history already records (the `--user`/`HOME` fixes in `CHANGELOG.md`).

> **Evidence**: `Read` of the sandbox runner's Docker invocation
> construction confirms `--user` is set from `resolveDefaultSandboxUser()`
> and `--env HOME=/workspace` is set unconditionally today.
> **Decision**: on a fresh checkout, the *host* UID performing the clone
> can differ from prior test runs; if `resolveDefaultSandboxUser()`'s
> fallback path for a UID with no resolvable `/etc/passwd` entry returns a
> value the runner doesn't distinguish in its error reporting, the
> generic `ERROR` string is consistent with this cause.
> **Action**: read `resolveDefaultSandboxUser()`'s full implementation and
> its existing `.spec.ts` coverage to confirm whether the no-passwd-entry
> case is handled or merely passed through.
> **Result**: the no-passwd-entry case is passed through without a
> distinguishing error reason — confirmed by absence of any test asserting
> behavior for that specific case.
> **Next decision**: evidence-sufficiency bar is met — the hypothesis
> explains the observed symptom (generic `ERROR`), is falsifiable (a
> targeted test can force this exact UID condition), and a fix targeting
> it can be verified to flip the reproduction from failing to passing.
> Proceed to fix design.

### Fix design and risk assessment

Minimal patch (Part IV.C — root cause is a narrow, single-function gap, not
a design flaw): give the runner's error-reason string a specific message
for this one failure mode, and add a defensive `HOME` default so a UID with
no passwd entry still resolves to a workable value instead of an ambiguous
failure. **Blast radius**: one function, one error-message path. **Regression
risk**: low — the change is additive and only engages on the
previously-broken condition. **Compatibility**: no public API/CLI signature
change. **Security**: none (no new privilege, no widened surface).

### Implementation

Files selected: the sandbox runner's user/home-resolution helper and its
Docker-flag assembly function — exactly the two files read during root-cause
analysis, no others.

### First implementation attempt and targeted validation

> **Evidence**: new `.spec.ts` case added, forcing a UID with no
> `/etc/passwd` entry; run `vitest run <sandbox-runner>.spec.ts`.
> **Decision**: apply the straightforward fix — set `HOME=/workspace`
> unconditionally whenever the resolved user has no passwd entry.
> **Action**: implement the fix, re-run the same targeted spec file.
> **Result**: the new test passes, but an *existing* test in the same file
> now fails — it asserts that an explicit `SYMBOLWRIGHT_SANDBOX_USER` override's
> own `$HOME` is respected when an operator has deliberately set one, and
> the unconditional fallback now overwrites that override.
> **Next decision**: this is a failed first attempt, not a dead end — the
> fix's mechanism was right (give the broken case a working `HOME`) but its
> scope was too broad (it also overwrote a working, intentional case).
> Repair, don't abandon.

### Repair iteration

> **Evidence**: the failing existing test's assertion and the runner's
> override-handling branch, re-read together.
> **Decision**: scope the `HOME` fallback to apply only when no explicit
> `SYMBOLWRIGHT_SANDBOX_USER` override is set, matching the precedent the
> runner already establishes elsewhere for override-vs-default handling.
> **Action**: narrow the conditional, re-run `vitest run
> <sandbox-runner>.spec.ts`.
> **Result**: both the new test and the previously-broken existing test now
> pass.
> **Next decision**: targeted check is green; widen to the full ladder.

### Widened validation

`npm run typecheck` → `npm run lint` → `npm run test:coverage` (full suite)
→ `npm run build` → `npm run validate` (aggregate). All green — this is the
`FULL_VALIDATION` state (Part XIV) being satisfied before diff audit.

### Diff audit

`git diff` read end-to-end: exactly the two source files plus the one
expanded spec file changed; no stray formatting changes; no debug output
left in. Matches the `DIFF_AUDIT` gate in Part XIV.

### Documentation decision

**[GATE check]**: is this user-visible enough to need a CHANGELOG entry?
Yes — it changes an operator-observable failure mode (a previously
unhelpful `ERROR` becomes actionable, or is avoided entirely). A CHANGELOG
bullet is added under `[Unreleased] > Fixed`, matching this repo's existing
terse-but-specific style; no new standalone doc is warranted for a
single-function fix (Part IV.F does not require one, unlike Part V.I).

### Commit preparation

One commit: the two source files, the expanded spec file, and the
CHANGELOG bullet, staged explicitly by name (never `git add -A`).

### PR construction

Follows the Part VII bug-fix template: root cause named specifically
(UID-with-no-passwd-entry on the sandbox `HOME` resolution path), the
changed files and new test named explicitly, the full validation ladder
checked off, and residual risk stated plainly: "only the no-passwd-entry
case was reproduced and fixed; other exotic container UID mappings are not
separately covered."

### Completion

All of Part IV.F's gate items hold: regression test proven to fail
pre-fix/pass post-fix, validation ladder complete, diff clean, no secrets/
debug code, CHANGELOG updated, PR prepared. State machine (Part XIV)
reaches `COMPLETE`.

---

## Part XIII — Worked Example: SymbolWright-Style Large PR Bundle

*(Realistic simulation. Grounded entirely in this repository's real,
inspected architecture — Bundle #6's `persistent-mission-executor.ts` /
`persistent-mission-repair-controller.ts` / `mission-dashboard-projection.ts`
/ `mission-impact-intelligence.ts`, and Bundle #7's
`repository-portability.ts` / `universal-repository-portability.ts` /
`DockerPortableValidationRunner`. This is explicitly **not** a claim that
this work has been implemented in this session — it demonstrates the
process, including the existing-state audit that would prevent re-shipping
what Bundles #5–#7 already shipped.)*

**Mission** (as given in the outline): "Add an autonomous multi-file
engineering and repair loop with persisted mission state, dependency-aware
task ordering, rollback, resume, conflict detection, build/test/lint/
typecheck validation, bounded repair attempts, and Mission Dashboard
visibility."

### Requirement extraction

Functional: engineering loop must edit multiple files, run validation, and
repair failures, all restart-safe. Non-functional: repair attempts bounded,
never unbounded retry. Architectural: must reuse the existing mission graph
and persistence rather than a second store. Compatibility: existing
missions/releases must be unaffected. Test: new behavior needs unit +
integration proof through the real live path. Documentation: a new
`docs/autonomy/BUNDLE<N>_*.md` doc, a CHANGELOG entry, and, if
foundation-level, a README listing.

### Existing-state audit — the decisive step

Grepping and reading before designing anything shows nearly every named
capability already exists:

- **[VERIFIED — existing repository capability]** Persisted mission state /
  dependency-aware task ordering: `persistent-mission-executor.ts` executes
  a durable task graph.
- **[VERIFIED — existing repository capability]** Rollback / resume, per
  `BUNDLE6_FINAL_AUTONOMOUS_ENGINEERING_RELEASE.md`: "Mission-owned edits
  are snapshotted before nested repair and restored to their pre-repair
  content when repair fails," and interrupted-task recovery on restart is
  covered by `mission-interrupted-recovery.spec.ts`.
- **[VERIFIED — existing repository capability]** Build/test/lint/typecheck
  validation, bounded repair: `persistent-mission-repair-controller.ts`
  plus Bundle #7's `DockerPortableValidationRunner` covers build/test/lint/
  typecheck/format/audit across nine ecosystems for arbitrary target
  repositories.
- **[VERIFIED — existing repository capability]** Mission Dashboard
  visibility: `mission-dashboard-projection.ts`, rendered by
  `missions-view.ts`.

**Conclusion of the audit**: implementing the mission as literally stated
would recreate four already-shipped subsystems under new names — exactly
the anti-pattern Part V.B and Part XI's risk table exist to prevent. The one
concrete gap the audit does surface: **[VERIFIED — existing repository
capability, but narrower than the mission implies]** conflict detection
today is operator-vs-mission (a transaction conflict check protects an
operator's own concurrent edits, per Bundle #6's "Existing operator changes
remain protected by transaction conflict checks"), but there is no
**mission-vs-mission** conflict detection — nothing stops two autonomous
missions from being started concurrently against overlapping files in the
same checkout. This becomes the bundle's actual, narrowly-scoped,
**[EXAMPLE PROPOSED EXTENSION]**: extending the existing conflict-check
boundary, not building a parallel system.

### Architecture (extension, not a new system)

- **[EXAMPLE PROPOSED EXTENSION — component boundary]**: a new guard inside
  the existing mission-start/resume path (where
  `persistent-mission-executor.ts` currently checks for operator conflicts)
  is extended to also check the file set of any other **non-terminal**
  mission's persisted plan against the file set the new mission's plan is
  about to touch.
- **[ASSUMPTION]** Data model: no new store is needed, on the assumption
  that the existing per-mission persisted plan already lists target files
  in a form cheap to compare across missions — this assumption should be
  confirmed by reading the actual plan schema before implementation begins,
  not taken on faith from this document. If false, the extension needs a
  small persisted index instead, which would change the task graph below.
- **[EXAMPLE PROPOSED EXTENSION — interface]**: one new pure function,
  `detectCrossMissionFileConflicts(candidatePlan, activeMissions)`,
  returning a list of overlapping file paths and the conflicting mission
  IDs.
- **[EXAMPLE PROPOSED EXTENSION — state transition]**: a mission whose plan
  overlaps an active mission's files transitions to a new terminal-adjacent
  state, `blocked-by-mission` (distinct from the existing operator-conflict
  `blocked` state so an operator can tell the two apart), with the
  conflicting mission ID recorded as evidence.
- **[EXAMPLE PROPOSED EXTENSION — error model]**: no exception thrown to
  the caller; the API route returns a structured `409`-shaped response
  naming the conflicting mission, mirroring the existing
  operator-conflict-check response shape.
- **[VERIFIED — unaffected by this extension]** Rollback/resume/concurrency:
  unchanged — this only gates *starting* overlapping work; it doesn't add a
  new rollback mechanism.
- **[EXAMPLE PROPOSED EXTENSION — observability]**: a new mission event
  type, `autonomy.conflict.cross_mission_detected`, following the existing
  `autonomy.*` event-naming convention `POST_BUNDLE7_FORENSIC_AUDIT.md`
  documents, and — learning directly from that audit's F1 — added to
  `MISSION_EVENT_FILTERS` in the same commit that introduces it, not as an
  afterthought.
- **[RISK]** Backward compatibility: missions with no file overlap are
  intended to be entirely unaffected; the risk is that the new check runs
  on *every* mission start/resume (not only overlapping ones), so its own
  cost and correctness on the non-overlapping path must be covered by a
  dedicated test, not assumed safe by construction.
- **[REQUIRED VALIDATION]**: a test asserting that a mission with zero file
  overlap against any active mission is not slowed or blocked, in addition
  to the overlap-detection tests themselves.

### Task graph and file plan

1. Types: extend the existing plan-conflict types in
   `src/autonomy/` with the new evidence shape.
2. Core domain: `detectCrossMissionFileConflicts` alongside the existing
   operator-conflict-check function it's modeled on.
3. Wiring: call the new check from `persistent-mission-executor.ts`'s
   existing start/resume path, immediately after the existing
   operator-conflict check.
4. Event: register `autonomy.conflict.cross_mission_detected` and extend
   `MISSION_EVENT_FILTERS`/`MISSION_EVENT_FILTER_LABELS` in
   `src/mission/mission-events.ts` in the same change.
5. API: extend the existing mission-start/resume route's response shape to
   surface the new `blocked-by-mission` state.
6. UI: `missions-view.ts` renders the new state and event using its
   existing generic event-render path (no new bespoke rendering needed,
   confirmed by re-reading how it already renders `event.type`/
   `event.summary` generically).
7. Tests: unit tests for `detectCrossMissionFileConflicts` (overlap and
   no-overlap cases); an integration test starting two missions with
   overlapping target files against a real `MissionStore` and asserting the
   second is `blocked-by-mission` with the correct evidence; a filter-render
   test extending the existing `mission-branch-coverage.spec.ts` pattern.
8. CI: no workflow change needed (no new command, no new ecosystem).
9. Docs: `docs/autonomy/BUNDLE8_CROSS_MISSION_CONFLICT_DETECTION.md` (this
   bundle's own doc, in the same house style as
   `BUNDLE7_UNIVERSAL_REPOSITORY_PORTABILITY.md`), a CHANGELOG entry, and a
   README "Current Foundation Docs" listing.
10. Final integration: an end-to-end proof that two real missions against a
    temporary workspace produce exactly one `blocked-by-mission` outcome and
    one visible timeline event under the `autonomy` filter.

### Repair loop behavior in this bundle

If step 3's wiring test fails because the existing operator-conflict check's
return shape doesn't compose cleanly with the new check's shape: capture the
type error, classify as a logic/interface-mismatch failure, locate the two
conflicting return-type declarations, apply the focused repair (align the
new function's return shape to the existing check's discriminated-union
convention rather than inventing a second shape), re-run the targeted test,
then the full suite. Bounded at the same small per-failure retry ceiling as
Part V.G; a third consecutive unprincipled attempt would stop and escalate
rather than continue guessing.

### Persistence and resume behavior

Because the new check reads from the existing mission store's own
already-persisted plans rather than adding new state, resume behavior is
inherited for free: after a restart, `persistent-mission-executor.ts`'s
existing interrupted-task reconciliation runs first (unchanged), and only
*then* would a *newly starting* mission be checked against whatever
non-terminal missions remain — meaning this feature cannot itself corrupt
or interfere with existing resume semantics, which is exactly the
compatibility requirement from Part V.A being satisfied by construction
rather than by a bolted-on special case.

### Rollback behavior

If a `blocked-by-mission` mission gets manually resumed later after the
conflicting mission finishes, no rollback of the *new* feature's own state
is needed — it holds no state of its own, so there is nothing to roll back;
this is called out explicitly in the design as a deliberate simplicity
choice, not an oversight.

### Dashboard integration

`mission-dashboard-projection.ts`'s existing per-mission status projection
gains one new possible status value: `blocked-by-mission`. The existing
Mission Dashboard UI needs no bespoke new panel — its existing status badge
rendering already handles arbitrary status strings.

### Validation commands (this bundle)

Per-slice: `vitest run src/autonomy/mission-conflict*.spec.ts` and
`npm run typecheck` after steps 1–3; `npm run lint` after step 4; full
integration test after step 7; `npm run test:coverage`, `npm run build`,
`npm run validate` before completion.

### Acceptance evidence

Every Part V.A requirement maps to a concrete artifact: the new function +
its unit tests (functional), the bounded retry precedent inherited from the
existing repair controller (non-functional), the reused mission-store/event
conventions (architectural), the zero-impact-on-non-overlapping-missions
test case (compatibility), the new doc + CHANGELOG + README entries
(documentation), and the two-missions integration test (the end-to-end
acceptance proof).

### PR construction

Title: `feat(autonomy): cross-mission file conflict detection`. Body follows
the Part VII Large PR Bundle template, with the Architecture section
explicitly naming which existing Bundle #6 functions are being extended
(not replaced), and a Follow-ups section noting that conflict detection is
currently file-path-exact-match only — semantic (e.g. same-module,
different-file) conflict detection is explicitly out of scope and named as
a deferred follow-up rather than silently dropped.

**What this example demonstrates about avoiding fake scaffolding**: the
entire design is bounded by what the existing-state audit found *actually
missing* rather than what the mission prompt's vocabulary suggested might be
missing; every new piece is verified against its real caller
(`persistent-mission-executor.ts`'s actual start/resume path, not a
mocked stand-in), the new UI state is confirmed to render through the
dashboard's existing generic rendering path rather than assumed, and the
new event type is added to the canonical filter list in the *same* change
that introduces it — directly applying the lesson `POST_BUNDLE7_FORENSIC_AUDIT.md`'s
F1 finding teaches, rather than repeating it.

---

## Part XIV — Machine-Reproducible Process Specification

### 1. Numbered master workflow

1. Receive and classify the task (Part I).
2. Discover the repository (Part II).
3. Analyze requirements into explicit/implied/constraints/acceptance
   criteria (Part I).
4. If bug/CI-repair path: reproduce the failure (Part IV.A) and perform
   root-cause analysis (Part IV.B). If Large-PR-Bundle path: perform the
   existing-state audit (Part V.B).
5. Design the fix or the bundle architecture (Part IV.C / V.C).
6. Plan the task/file sequence (Part IV.D / V.D).
7. Implement, slice by slice, with continuous validation (Part IV.D–E /
   V.E–F).
8. Run full validation; repair failures under the bounded loop (Part IV.E /
   V.G), escalating to `BLOCKED` if the retry boundary is hit.
9. Audit the final diff (Part IV.F / V.I).
10. Update documentation (Part IV.F / V.I).
11. Prepare the commit(s) and PR (Part VI–VII).
12. Push, open/update the PR, and, where this environment supports it,
    subscribe to its activity.
13. On a red check post-push, re-enter the repair loop scoped to CI (Part
    VIII) until green or `BLOCKED`.
14. Report completion with evidence, or report `BLOCKED`/`ROLLED_BACK` with
    evidence, per Part XIV's completion checklist below.

### 2. State machine

States: `INTAKE`, `REPOSITORY_DISCOVERY`, `REQUIREMENT_ANALYSIS`,
`REPRODUCTION`, `ROOT_CAUSE_ANALYSIS`, `DESIGN`, `TASK_PLANNING`,
`IMPLEMENTATION`, `TARGETED_VALIDATION`, `FULL_VALIDATION`, `REPAIR`,
`DIFF_AUDIT`, `DOCUMENTATION`, `PR_PREPARATION`, `COMPLETE`, `BLOCKED`,
`ROLLED_BACK`.

| From | To | Condition |
| --- | --- | --- |
| `INTAKE` | `REPOSITORY_DISCOVERY` | Task received and classified |
| `REPOSITORY_DISCOVERY` | `REQUIREMENT_ANALYSIS` | Part II intake checklist complete, target repo/branch confirmed |
| `REQUIREMENT_ANALYSIS` | `REPRODUCTION` | Task classified as bug fix / CI repair and a concrete failure exists to reproduce |
| `REQUIREMENT_ANALYSIS` | `DESIGN` | Task classified as feature / bundle / docs-only (no reproduction needed) |
| `REPRODUCTION` | `ROOT_CAUSE_ANALYSIS` | Failure reproduced locally or root cause is directly evident from CI/logs |
| `REPRODUCTION` | `BLOCKED` | Failure cannot be reproduced or evidenced after reasonable effort |
| `ROOT_CAUSE_ANALYSIS` | `DESIGN` | Root cause meets the evidence-sufficiency bar (Part IV.B) |
| `ROOT_CAUSE_ANALYSIS` | `BLOCKED` | No hypothesis explains all observed symptoms after reasonable effort |
| `DESIGN` | `TASK_PLANNING` | Fix/architecture chosen and scoped |
| `TASK_PLANNING` | `IMPLEMENTATION` | File/task sequence defined |
| `IMPLEMENTATION` | `TARGETED_VALIDATION` | A logical slice is complete |
| `TARGETED_VALIDATION` | `IMPLEMENTATION` | Targeted checks pass and more slices remain |
| `TARGETED_VALIDATION` | `REPAIR` | Targeted checks fail |
| `IMPLEMENTATION` | `FULL_VALIDATION` | All planned slices complete |
| `FULL_VALIDATION` | `DIFF_AUDIT` | Full validation ladder passes |
| `FULL_VALIDATION` | `REPAIR` | Any check in the ladder fails |
| `REPAIR` | `TARGETED_VALIDATION` / `FULL_VALIDATION` | Focused repair applied, re-running the check it targeted |
| `REPAIR` | `BLOCKED` | Bounded retry ceiling reached without resolution |
| `REPAIR` | `ROLLED_BACK` | Repair itself proves the chosen design/approach unsound; reverting to last known-good state is safer than continuing |
| `DIFF_AUDIT` | `DOCUMENTATION` | Diff matches intent, no unintended files, no secrets/debug code |
| `DIFF_AUDIT` | `IMPLEMENTATION` | Diff review finds a gap (Part V.I checklist item missing) |
| `DOCUMENTATION` | `PR_PREPARATION` | Docs/CHANGELOG/README updated per Part IV.F / V.I |
| `PR_PREPARATION` | `COMPLETE` | Commit(s) made, pushed, PR opened/updated, all Part VI/VII gates satisfied |
| `PR_PREPARATION` | `BLOCKED` | A push/commit precondition fails (dirty tree not owned by this session, failing mandatory gate, missing authorization for a required destructive step) |
| `COMPLETE` | `REPAIR` | A post-push CI check goes red (Part VIII) |
| `ROLLED_BACK` | `TASK_PLANNING` | A revised, smaller-blast-radius design is chosen after rollback |

### 3. Task-state model

Each task-graph node (Part V.D) carries: `id`, `dependsOn[]`,
`status ∈ {pending, in_progress, validated, blocked, rolled_back}`,
`validationCommand`, `filesTouched[]`, `commitBoundary` (whether it lands as
its own commit). A node moves `pending → in_progress` when its dependencies
are all `validated`; `in_progress → validated` when its targeted check
passes; `in_progress → blocked` when its repair loop exhausts its retry
ceiling; `blocked → rolled_back` when the decision is made to revert rather
than continue repairing.

### 4. Failure-state model

A failure instance carries: `command`, `exitCode`, `rawOutput`,
`classification` (Part XI table 3), `firstMeaningfulError`,
`isPreExisting: boolean`, `repairAttempts[]` (each with the change made and
the re-run result). A failure transitions `open → resolved` when its
targeted check passes, or `open → escalated` when `repairAttempts.length`
reaches the bounded ceiling.

### 5. Validation-state model

Per check in the ladder (Part IV.E / V.F): `status ∈ {not_run, running,
passed, failed, pre_existing_failure}`. `FULL_VALIDATION` state is only
entered once every applicable check for the task's classification (Part
XI table 2) is at least `not_run → running` in sequence; `DIFF_AUDIT` is
only entered once every required check is `passed` or explicitly
`pre_existing_failure` (documented, not silently accepted).

### 6. Completion checklist **[GATE]**

- [ ] Every acceptance criterion from `REQUIREMENT_ANALYSIS` maps to a
      concrete diff hunk or test.
- [ ] Full validation ladder required for this task's classification
      (Part XI table 2) is green, or documented as pre-existing.
- [ ] `git diff`/`git status` audited; only intended files changed.
- [ ] No secrets, no debug code, no placeholder scaffolding remain.
- [ ] Docs/CHANGELOG/README updated where the change is user- or
      operator-visible.
- [ ] Commit(s) follow Part VI's structure; push verified.
- [ ] PR opened/updated per Part VII, draft unless told otherwise.
- [ ] PR activity subscription active, where this environment supports it.
- [ ] Final report states remaining risk and any deferred follow-ups
      explicitly.

### 7. Pseudocode

**Issue repair**

```text
function repairIssue(report):
    evidence = reproduce(report)                  # Part IV.A
    if evidence is null: return BLOCKED("cannot reproduce")
    hypothesis = formRootCauseHypothesis(evidence) # Part IV.B
    while not explainsAllSymptoms(hypothesis, evidence):
        hypothesis = revise(hypothesis, evidence)
        if attempts_exceeded(): return BLOCKED("no confirmed root cause")
    design = chooseFixScope(hypothesis)            # Part IV.C, Table 1
    files = selectFiles(design)
    for file in sequence(files):                   # Part IV.D
        edit(file)
        result = runTargetedCheck(file)
        if not result.passed:
            result = repairLoop(result)             # see below
            if result.status == BLOCKED: return BLOCKED(result.evidence)
    full = runFullValidationLadder(design.classification)  # Table 2
    if not full.passed:
        full = repairLoop(full)
        if full.status == BLOCKED: return BLOCKED(full.evidence)
    audit = auditDiff()                             # Part IV.F
    if not audit.clean: return repairIssue-continue(audit)
    updateDocs(design)
    return prepareAndPushPR(kind="bugfix")           # Part VI-VII
```

**Large PR Bundle execution**

```text
function executeBundle(mission):
    requirements = decompose(mission)                # Part V.A
    existing = auditExistingState(requirements)       # Part V.B — MANDATORY
    scope = requirements - existing.alreadyShipped     # avoid duplication
    if scope.isEmpty(): return COMPLETE("nothing left to build; document why")
    design = architect(scope, existing)                # Part V.C
    graph = buildTaskGraph(design)                     # Part V.D
    for node in topologicalOrder(graph):
        implementSlice(node)                            # Part V.E
        result = runTargetedCheck(node)
        if not result.passed:
            result = repairLoop(result)
            if result.status == BLOCKED: markNode(node, "blocked"); break
        markNode(node, "validated")
    full = runFullValidationLadder("bundle")            # Part V.F, Table 2
    if not full.passed:
        full = repairLoop(full)
        if full.status == BLOCKED: return BLOCKED(full.evidence)
    verifyEndToEnd(design)                               # Part V.H — real path only
    audit = auditDiff()
    if not audit.clean: return executeBundle-continue(audit)
    updateDocs(design); updateChangelog(design); updateReadmeIndex(design)
    return prepareAndPushPR(kind="bundle")               # Part VI-VII
```

**Validation and repair loop**

```text
function repairLoop(failure, ceiling=SMALL_BOUNDED_N):
    attempts = 0
    while attempts < ceiling:
        capture(failure)                                 # step 1
        first = firstMeaningfulError(failure)             # step 2
        category = classify(first)                        # step 3, Table 3
        location = locate(first)                           # step 4
        if isPreExisting(location, baseBranch):
            return { status: "documented_pre_existing", evidence: failure }
        fix = focusedRepair(category, location)             # step 6
        apply(fix)
        attempts += 1
        narrow = runNarrowestCheck(location)                 # step 7
        record(attempts, fix, narrow)                          # step 9
        if narrow.passed:
            broad = runBroaderValidation()                      # step 8
            if broad.passed: return { status: "resolved" }
            failure = broad; continue
        failure = narrow
    return { status: "BLOCKED", evidence: allAttempts() }        # step 10
```

**Final PR preparation**

```text
function prepareAndPushPR(kind):
    assertCleanIntentDiff()                              # only intended files
    assertNoSecretsOrDebugCode()
    commitMessage = formatCommit(kind)                     # Part VI
    commit(files=explicitList, message=commitMessage)      # never `add -A`
    if requiresDestructiveGitOp(): return AUTH_REQUIRED()
    push(branch, force=False)
    existingPR = findOpenPR(branch)
    if existingPR: updatePR(existingPR, body=buildBody(kind))  # Part VII
    else: pr = createDraftPR(body=buildBody(kind))
    subscribeToPRActivity(pr)
    return COMPLETE(commitSha, branch, pr)
```

---

## Limitations and honesty notes

- This document does not and cannot expose private model reasoning; every
  step above is described at the level of observable inputs, tool calls,
  and outputs — the same level of detail a session transcript or PR history
  would show a human reviewer.
- Repository-specific commands (`npm run validate`, the exact `ci.yml`
  steps, file paths like `persistent-mission-executor.ts`) were read from
  this repository at the time of writing and can drift as the codebase
  evolves; a future agent using this document should re-verify them against
  the live repository rather than trusting them as permanently accurate.
- Parts XII and XIII are explicitly labeled realistic simulations, not
  records of code actually shipped in this session — this session's only
  actual changes are this document itself plus the two narrowly additive
  index entries in `README.md` and `CHANGELOG.md`.
- Retry/repair bounds are described qualitatively ("a small bounded number,"
  "the retry ceiling") rather than as a single universal constant, because
  the right bound is itself a repository/task-specific judgment call, not a
  fixed number this document should pretend to prescribe globally.
