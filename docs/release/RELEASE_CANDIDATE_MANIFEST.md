# Release Candidate Manifest

This document describes `release-candidate.json`, the machine-readable record that gives a
SymbolWright release a single, internally consistent identity before it is tagged and published. It
is part of [Large PR Bundle #14](LARGE_PR_BUNDLE_14_RELEASE_CANDIDATE_BUILD_PLAN.md), which turns a
release-ready source tree into a verifiable public technical-preview release candidate.

## What this is not

**The presence of `release-candidate.json` does not mean anything has been published.** A release
candidate is prepared, validated, and reviewed entirely before the corresponding npm package or
GHCR image exists. The manifest's `packageTarballSha256` and `containerDigest` fields are
deliberately optional and are only ever populated once the real publish pipeline (Large PR Bundle
#14, PR 5) has actually produced and recorded those artifacts. A manifest that claims an overall
`PASS` verdict without those two fields recorded in a valid format is rejected as inconsistent — see
[`validateArtifactEvidenceRecorded`](../../src/release/release-candidate.ts) — precisely so this
document's claim stays true in the code, not only in prose.

## Normal development is not affected

There is no `release-candidate.json` in the repository during ordinary `[Unreleased]` development,
and there does not need to be one. `npm run release-readiness` (part of `npm run validate`, which
every CI run executes) includes a `RELEASE_CANDIDATE_CONTRACT` gate that **passes** when no manifest
exists — normal PRs are never blocked by a release contract they have no reason to satisfy. The
gate only starts enforcing anything once a manifest is actually present, and at that point it must
be fully self-consistent.

## When the manifest is created

The manifest is authored as part of formal release preparation, after `npm run release:prepare
<version>` has already bumped `package.json`, `package-lock.json`, and `CHANGELOG.md` to the target
version — never before, since several of the manifest's own fields (`candidateVersion`,
`packageLockVersion`) must match what those files actually say.

`sourceCommitSha` records the exact commit SHA of the last reviewed code/content commit this
candidate is validated against. It intentionally refers to an **ancestor** commit, not the commit
that introduces or updates the manifest itself — a commit cannot embed its own hash before it
exists, so trying to make the manifest self-referential is not just unnecessary, it is impossible.
This mirrors the convention already used by this repository's final adversarial audit documents
(e.g. `docs/security/SANDBOX_FINAL_ADVERSARIAL_AUDIT.md`'s "Audited code SHA" / "Correction-
validation SHA" pair), which likewise never point at the commit that records them.

## Schema

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | Manifest format version, currently always `1`. |
| `packageName` | string | Must equal `package.json`'s `name`. |
| `candidateVersion` | string | Semantic version; must equal `package.json`'s `version` and `packageLockVersion`. |
| `sourceCommitSha` | string | Exact 40-character commit SHA of the last validated ancestor commit. |
| `packageLockVersion` | string | Must equal `package-lock.json`'s top-level `version`. |
| `createdAt` | string | ISO-8601 timestamp; must parse as a valid date. |
| `expectedNpmPackage` | string | Must equal `package.json`'s `name`. |
| `expectedGhcrImage` | string | Must be a valid `ghcr.io/<owner>/<repo>` reference. |
| `auditDocumentPath` | string | Repository-relative path to the audit document backing this candidate; the file must exist and contain both an `` `Audited code SHA:` `` line and a `` `Release verdict:` `` line whose verdict is `PASS`. |
| `testEvidence` | object | `testFilesPassed`, `testsPassed`, `coverageStatementsPct`, `coverageBranchesPct`, `coverageFunctionsPct`, `coverageLinesPct` — all numeric, coverage percentages within `[0, 100]`. |
| `packageTarballSha256` | string (optional) | 64-character lowercase hex SHA-256 of the exact `npm pack` tarball. Only set once PR 5's publish pipeline has actually produced one. |
| `containerDigest` | string (optional) | `sha256:<64 hex>` immutable container digest. Only set once PR 5's publish pipeline has actually pushed one. |
| `releaseVerdict` | `PASS \| FAIL \| BLOCKED \| NOT_RUN` | The candidate's own release verdict. `PASS` requires both artifact fields above to be present and validly formatted — a candidate cannot claim readiness while still pointing at unrecorded artifacts. |

## Verification entry points

- **`npm run release-readiness`** (part of `npm run validate`, runs in every CI job): the
  `RELEASE_CANDIDATE_CONTRACT` gate. PASSes with no manifest present; validates full consistency
  once one exists.
- **`npm run release:verify-candidate`** (`src/cli-release-candidate-verify.ts`): the strict, formal
  check used during actual release preparation. A missing manifest is reported as **BLOCKED**, not
  silently passed — a formal release candidate cannot be verified without one. When a manifest is
  present and otherwise consistent, this command additionally shells out to `git cat-file -e
  <sha>^{commit}` to confirm `sourceCommitSha` is a real, reachable commit in this repository's
  history, catching a stale, fabricated, or copy-pasted-from-elsewhere SHA that the pure schema
  check alone cannot detect.

Both entry points share the exact same consistency rules
(`src/release/release-candidate.ts`'s `validateManifestConsistency`) — only what happens when the
manifest is *absent* differs between the two.
