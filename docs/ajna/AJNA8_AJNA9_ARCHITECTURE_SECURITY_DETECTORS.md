# AJNA-8 & AJNA-9 — Architecture Drift and Security-Sensitive Path Detectors

`CODEMIND_AJNA_ROADMAP.md` listed `AJNA-8: Architecture drift detector` and
`AJNA-9: Security-sensitive path detector` as review phases, and
`ajna-review.types.ts` already had `ARCHITECTURE_DRIFT`/`SECURITY_SENSITIVE_CHANGE`
finding categories and `BLOCKED_BY_ARCHITECTURE_DRIFT`/`BLOCKED_BY_SECURITY`
merge-readiness statuses wired into `ajna-merge-readiness.ts`. Nothing produced
findings in those categories from a real diff — every finding came from evidence a
caller supplied by hand. AJNA-8 and AJNA-9 are the two detectors that close that gap.

## AJNA-9: security-sensitive path detector

`src/ajna/ajna-security-sensitive-paths.ts` classifies changed file paths into three
tiers, matched by path text only (it never opens or reads a file):

| Tier                      | Risk     | Blocks merge | Examples                                                             |
| ------------------------- | -------- | ------------ | ---------------------------------------------------------------------- |
| `secrets-and-crypto`      | CRITICAL | yes          | `.env*`, `secrets/`, `credentials`, `*.pem`/`*.key`, `crypto`/`cipher`  |
| `auth-and-access-control` | HIGH     | yes          | `auth*`, `session`/`oauth`/`jwt`/`sso`, `permission`/`acl`/`rbac`       |
| `supply-chain`            | MEDIUM   | no           | `.github/workflows/`, `Dockerfile`, lockfiles                          |

One finding is emitted per matched tier (not per file) to avoid finding spam; each
finding lists every matched file as evidence. The blocking tiers drive
`deriveAjnaMergeReadiness` to `BLOCKED_BY_SECURITY`, which requires an explicit
operator decision — Ajna classifies and recommends, it does not self-authorize a
merge past a security-sensitive change. The rule set is fully overridable by a
caller-supplied `AjnaSecuritySensitivePolicy` for repository-specific conventions.

## AJNA-8: architecture drift detector

`src/ajna/ajna-architecture-drift.ts` produces two independent, evidence-backed
signals from changed file paths and, optionally, diff-derived import edges:

1. **Layering violations** — an import edge (`{ importer, imported }`) that crosses
   a directional boundary declared in a caller-supplied `AjnaArchitecturePolicy`
   (e.g. `{ from: 'portability', mustNotImport: ['ajna'] }`). This only runs when a
   policy is supplied: Ajna has no generic way to infer what a repository's intended
   module boundaries are, so it never guesses. A violation is HIGH risk and blocks
   merge (`BLOCKED_BY_ARCHITECTURE_DRIFT`).
2. **Change breadth** — a single review touching more than a configurable number of
   distinct top-level `src/<module>/` directories (default 5). This requires no
   policy and applies to any repository using that layout. It is MEDIUM risk,
   informational only (`blocksMerge: false`), surfaced as an `INFERRED_RISK`-class
   finding so an operator notices a cross-cutting change without being blocked by it.

## Wiring

Both detectors run automatically inside
`normalizeGithubPullRequestForAjnaReview` (`src/ajna/ajna-github-review-normalizer.ts`)
— the seam that turns a live GitHub PR payload into Ajna review input — so every
normalized PR review gets these findings for free from `changedFiles` alone, with
`importEdges` and policy overrides as optional payload/option fields. No caller needs
to construct these findings by hand the way `diffEvidence`/`ciEvidence` findings still
must be supplied externally.

## Safety posture

- Path matching only; no file contents are read, no diff is parsed by Ajna itself.
- No new network, write, or execution capability — this is pure classification over
  data a caller already has.
- Policies are always caller-supplied or the safe built-in default; nothing is
  inferred about an arbitrary repository's intended architecture.
- Ajna still cannot self-authorize a merge: blocking findings from either detector
  can only be resolved by an operator decision, never by Ajna itself.
