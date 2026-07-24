# Bundle #8 — External Repository Acquisition & GitHub Operations

Bundle #8 upgrades CodeMind from a repo-local autonomous engineering system into an
external GitHub repository operator: it can accept a GitHub repository reference,
validate it, acquire it into an isolated workspace, detect its ecosystem using Bundle
#7 portability, run the existing (unmodified) autonomous mission runtime against it,
and produce evidence-backed PR preparation — all while keeping every remote GitHub
mutation blocked by default until an operator explicitly allows it.

## Overview

The production flow is:

1. **Parse** a GitHub repository reference (`github-repository-target.ts`) into a
   validated, canonical target — rejecting path traversal, embedded credentials,
   unsupported protocols, shell metacharacters, and non-allowlisted hosts.
2. **Acquire** the repository (`repository-acquisition.ts`) by cloning it into a
   controlled workspace directory under `.codemind/external-repos/`, or by
   duplicating an already-local repository into an isolated copy.
3. **Profile** the acquired workspace (`repository-intake-profile.ts`), running
   Bundle #7's `discoverUniversalRepositoryPortability` to detect ecosystems,
   validation commands, package roots, and CI workflow evidence, and computing risk
   flags (mixed ecosystem, low confidence, unsupported toolchain, fork/archived/private
   metadata when known).
4. **Create a mission** (`external-repository-intake.ts`) rooted at the acquired
   workspace, using the existing, unmodified `MissionService`/autonomous mission
   runtime — see "Mission runtime integration" below for why no changes were needed
   to Bundle #6/#7's runtime code.
5. **Prepare a PR packet** (`pr-operation-packet.ts`): a local branch, staged and
   committed changes, and a generated title/body/commit message with validation
   evidence (secrets redacted), portability summary, repair attempts, risk flags, and
   rollback notes. This step is entirely local and works even when GitHub writes are
   blocked.
6. **Optionally publish** (`github-operations-adapter.ts`): push the branch and open a
   draft PR through the real GitHub API, gated by an explicit policy opt-in and a
   configured `GITHUB_TOKEN`.

Every step above is real, tested code — not scaffolding. Sections below detail the
safety model that makes each step, especially the later ones, safe to ship.

## Supported repository target formats

`parseGitHubRepositoryTarget` (`src/github/github-repository-target.ts`) accepts:

- `https://github.com/owner/repo`, with or without a trailing `.git`
- `git@github.com:owner/repo.git` (SSH form)
- `https://github.com/owner/repo/tree/<ref>` → `targetType: 'branch'`
- `https://github.com/owner/repo/pull/<number>` → `targetType: 'pull-request'`
- `https://github.com/owner/repo/issues/<number>` → `targetType: 'issue'`
- `https://github.com/owner/repo/blob/<ref>/<path>` → `targetType: 'file'`
- `owner/repo` shorthand, when unambiguous (no `://`, no `@`, no spaces, exactly one
  `/`, both segments syntactically valid)
- Any other recognized path shape is `targetType: 'unknown'` rather than guessed

Rejected unconditionally: empty input, shell metacharacters
(`; & | \` $ < > ( ) { } [ ] * ? ~ ! # ^`), `..` path-traversal segments, malformed
owner/repo segments (GitHub's own naming rules), non-`https`/non-SSH protocols
(`ftp:`, `file:`, `javascript:`, etc.), embedded URL credentials
(`https://user:pass@...`), and hosts not on the allowlist (`github.com` by default;
additional hosts — e.g. for GitHub Enterprise Server — must be explicitly supplied by
the caller via `allowedHosts`, never inferred).

The parser deliberately never resolves or fabricates a default branch: that requires
a real API call, which a pure parser never makes.

## Acquisition modes

`acquireExternalRepository`/`duplicateLocalRepository` (`repository-acquisition.ts`)
support three modes:

- **`dry-run`** — computes the plan (destination path, requested ref) and validates
  everything, but performs no filesystem or network operation at all.
- **`read-only`** — performs a real clone/duplicate so ecosystem detection can run
  against real files, intended for analysis without a following mission run.
- **`writable`** — same real clone/duplicate, intended to be followed by mission
  creation and edits.

Every acquisition destination is computed by CodeMind under
`<workspaceRoot>/.codemind/external-repos/<sanitized-slug>-<hash>` and verified to stay
inside that root before any I/O — a caller-supplied path is never used directly. Refs
are validated against a strict allowlist pattern (rejecting leading `-` to prevent
flag injection, `..`, spaces, and shell metacharacters) before being passed to `git
checkout`. A clone or checkout failure is reported as `acquired: false` with a
specific error — never silently treated as a smaller, empty success. A clone that
technically succeeds but leaves the working tree empty because the remote's default
branch reference doesn't resolve (a broken-HEAD remote) is also reported as a failure,
not misreported as "empty repository" — see `verifyAcquiredWorkspace` in
`repository-acquisition.ts`.

**Known limitation**: acquisition does not authenticate git clone with a token.
Embedding a token in a clone URL or process argument would leak it into process
listings and, if not perfectly scrubbed, into evidence — a risk the "no leaking GitHub
tokens" rule exists to prevent. Private-repository acquisition is therefore out of
scope for this bundle; only public, anonymously-cloneable repositories are supported.

## Safety policy

`GitHubOperationsPolicy` (`github-operations-policy.ts`) is the coarse, first-line
switch for eleven operation categories:

| Category | Default |
| --- | --- |
| `read_repo_metadata`, `clone_repo`, `create_branch` (local), `commit_changes` (local) | **allowed** |
| `push_branch`, `open_pull_request`, `comment_on_issue`, `label_issue`, `close_issue`, `rerun_workflow`, `delete_branch` | **blocked** unless explicitly enabled |

The four default-allowed operations are workspace-scoped only: cloning into the
controlled directory, and creating a local branch/commit inside the acquired clone.
None of them touch the real remote repository. Every remote-mutating operation is
blocked until a caller passes it in `enabledOperations`, and every evaluation returns
a typed `GitHubOperationEvaluation` with a `reason` string naming exactly which rule
allowed or blocked it — there is no silent default.

This policy is additive to, not a replacement for, the existing approval-ticket
GitHub write gate (`runtime/github-write/github-write-gate.ts`): a remote write that
passes `GitHubOperationsPolicy` still goes through that gate (and, for the LLM tool
surface, a runtime approval ticket) before any GitHub API call executes.

## Write-operation policy in practice

`GitHubOperationsAdapter` (`github-operations-adapter.ts`) is the real GitHub
read/write surface: reads (`getRepositoryMetadata`, `getDefaultBranch`,
`getPullRequestChecks`, `getWorkflowRuns`, `getIssues`, `getPullRequests`) call the
same `GitHubHttpClient` the existing live-read adapters use; writes
(`createBranch`, `pushBranch`, `openPullRequest`) delegate to the existing,
already-real `GitHubPrCreationClient`/`DefaultGitHubPrCreationClient` (Git Data API
branch/commit/PR creation) rather than reimplementing that HTTP logic.

Every method returns a typed outcome — `{ status: 'ok' | 'blocked' | 'unavailable' |
'error', data?, reason? }` — instead of throwing or faking success:

- `blocked`: the operation failed `GitHubOperationsPolicy` before any HTTP call was
  attempted.
- `unavailable`: no `GitHubHttpClient`/token is configured, so the operation cannot
  even be attempted.
- `error`: a real HTTP call was made and failed (non-2xx status, network error).
- `ok`: a real HTTP call succeeded.

The API routes (`POST /api/missions/:id/github-pr-packet/publish`) surface these
outcomes directly as 200-status JSON — a blocked or unavailable publish attempt is
not an HTTP error, it's an honest, structured result the operator UI renders.

## PR packet flow

`preparePrOperationPacket` (`pr-operation-packet.ts`) is the non-destructive
PR-preparation path, and it works even when every remote write is blocked:

1. Creates a real local branch (`git checkout -b`) in the mission's acquired
   workspace.
2. Stages (`git add`) and commits (`git commit`) the mission's changed files.
3. Generates a PR title (from the mission objective), a commit message, and a full
   markdown PR body containing: changed-file summary, validation evidence (run
   through `redactValidationOutput` before being embedded, so secrets/tokens/paths
   never reach the PR body), the Bundle #7 portability summary, repair attempts, risk
   flags, and rollback notes (`git checkout <base> && git branch -D <branch>`).
4. Reports `writesAllowed`/`pullRequestCreationAllowed` from the policy actually
   passed in, so a caller/UI never has to guess whether "Open Pull Request" should be
   enabled.

The AI Mission Control UI's "GitHub PR Packet" card generates this packet, shows the
title/body, offers a "Copy PR body" action, and only enables "Open Pull Request" when
the packet reports both flags true — the button is disabled, not hidden, so an
operator always understands why.

## Mission runtime integration

`performExternalRepositoryIntake` (`external-repository-intake.ts`) is the only new
mission-runtime integration point, and it deliberately does **not** fork the
autonomous mission runtime. Once a repository is acquired, it calls the existing,
unmodified `MissionService.create({ repositoryPath, ... })` with the acquired
workspace as the repository path. `MissionService.create` already reads real git
state (remote URL, branch, HEAD) from whatever path it is given, and Bundle #6's
autonomy runtime and Bundle #7's portability discovery already operate generically on
`mission.repository.rootPath` — neither needed a single line changed to support a
mission whose repository happens to be an external clone instead of the CodeMind
checkout itself. This was verified, not assumed: see
`src/autonomy/external-repository-mission.integration.spec.ts`.

## External repository trial design

CI never depends on live public GitHub. `external-repository-acquisition.integration.spec.ts`
and `external-repository-mission.integration.spec.ts` simulate an external GitHub
repository entirely with local git:

1. `git init --bare` creates a bare "origin" standing in for a GitHub remote.
2. A real working checkout commits fixture files and pushes them to that bare origin
   (with `HEAD` explicitly pointed at the pushed branch, matching how a real GitHub
   repository's default branch is always resolvable — this was discovered to matter
   during test development: `git init --bare` alone leaves `HEAD` pointing at a
   branch name that was never pushed, which the acquisition layer now detects and
   reports honestly rather than misreporting as "empty repository").
3. `acquireExternalRepository` clones from that bare origin using the exact same code
   path it would use for `https://github.com/owner/repo` — only the URL differs.
4. Ecosystem fixtures cover a simple Node repo, a Python repo, a mixed Node/Python
   monorepo (asserting `mixed: true` and multiple package roots), and an
   unsupported-toolchain repo (`build.zig`) asserting zero validation commands, a
   non-empty `researchQueries` list mentioning Zig, and the
   `unsupported-toolchain-requires-research` risk flag — proving research stays
   advisory and is never promoted into an executable command.
5. The mission-level trial acquires a repository, creates a mission through the
   unmodified mission system, mutates a file the way an edit executor would, and
   generates a PR packet — then asserts the bare origin's refs are byte-for-byte
   identical before and after, proving the original is untouched unless explicitly
   pushed (which nothing in this bundle does automatically).

## Known limitations

- **No private-repository acquisition.** Only anonymously-cloneable public
  repositories are supported; see "Acquisition modes" above.
- **No GitHub Enterprise Server support by default.** `allowedHosts` must be supplied
  explicitly by a caller; nothing infers or allowlists additional hosts automatically.
- **Publish path is real but not live-network-tested in CI.** `GitHubOperationsAdapter`
  reuses the already-real `GitHubPrCreationClient`, and its request/response mapping
  and policy gating are fully unit-tested against a mock HTTP client, but no CI run
  makes a live call to api.github.com — that would require live credentials and cost
  controls CI intentionally does not have. Manual verification against a real
  throwaway repository is recommended before relying on the publish path in
  production.
- **The mission planner does not yet reason about `researchQueries`.** Bundle #7's
  advisory web-research evidence is surfaced in the intake profile and risk flags, but
  nothing in the mission planner currently acts on it (this mirrors Bundle #7's own
  scope — research remains advisory everywhere, not just here).
- **`rerun_workflow`, `comment_on_issue`, `label_issue`, `close_issue`, and
  `delete_branch`** are modeled in the policy taxonomy (blocked by default, as
  specified) but have no adapter method yet — enabling them in
  `enabledOperations` currently has no effect because nothing calls them. This is
  intentional: only implemented operations are wired to a policy check.

## Next bundle recommendations

1. Build the missing adapter methods (`rerunWorkflow`, `commentOnIssue`, `labelIssue`,
   `closeIssue`, `deleteBranch`) so the full policy taxonomy has real, callable
   implementations, not just reserved categories.
2. Add optional token-based private-repository acquisition using a short-lived
   credential helper or `GIT_ASKPASS` script (never a URL-embedded or argv-visible
   token), with the same "no leaking tokens" evidence discipline this bundle applied
   to public-repo acquisition.
3. Feed `researchQueries`/research evidence into the mission planner as an explicit
   "needs operator research decision" gate, rather than leaving it informational only.
4. Add a live (manually-triggered, credentialed) smoke test against a disposable
   throwaway GitHub repository to validate the publish path end-to-end outside CI.
