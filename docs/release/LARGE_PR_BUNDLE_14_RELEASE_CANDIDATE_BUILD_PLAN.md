# Large PR Bundle #14 — Release Candidate, External Proof, and Public Technical-Preview Closure

## 1. Verified starting state

- **Repository:** `JLPARTIN/SymbolWright`
- **Verified `origin/main` SHA at bundle start:** `1b20a12354defb406c04bb84ff65889a131fd3ab` — confirmed
  live via `git fetch --all --prune && git rev-parse origin/main` immediately before any bundle
  work began, not assumed from the operator's kickoff prompt. This matches the operator's stated
  last-known revision and is the exact merge commit for PR #348 (Large PR Bundle #13's final
  adversarial audit and release closure).
- **Package version:** `0.2.0` (`package.json` and `package-lock.json` agree).
- **`CHANGELOG.md`:** has an `[Unreleased]` section with no dated release section yet — no formal
  release has ever been cut from this repository.
- **Git tags:** one tag exists, `bundle12-final-audit-2026-07-28` (an audit-evidence tag from a
  prior bundle, not a version tag). No `v*.*.*` tag exists.
- **GitHub Releases:** none (`list_releases` returns an empty array).
- **Open pull requests:** none at bundle start.
- **npm registry:** `GET https://registry.npmjs.org/symbolwright` returns `404` — the package has
  never been published. This is a directly observed fact, not an assumption.
- **GHCR:** an anonymous, tokenless `GET /v2/jlpartin/symbolwright/tags/list` returns `401`, which
  the Docker Registry v2 API returns for both "does not exist" and "exists but requires auth" —
  this session cannot distinguish those two cases without a registry credential. Treated as
  **BLOCKED**, not evidence either way, in this plan and will be re-verified with real publish
  evidence once PR 5 exists.
- **`symbolwright.com` deployment material:** none found anywhere in the repository (`grep -ril
  "symbolwright.com"` across `.md`/`.ts`/`.yml`/`.json` returns no hits). There is no existing
  hosted-deployment configuration this bundle needs to reconcile with.
- **Repository-setting verification** (required CI checks, force-push/deletion protection, private
  vulnerability reporting, tag immutability policy, GHCR visibility): the GitHub MCP tools
  available in this session do not expose a branch-protection or repository-settings read endpoint.
  These remain an **operator-verified, not code-verified**, checklist item — see §7 and PR 5 §5.6.
  `SECURITY.md` already documents that private vulnerability reporting is the intended disclosure
  channel; whether it is actually *enabled* in repository settings cannot be confirmed from here.

### Files read during the forensic phase

`package.json`, `package-lock.json`, `CHANGELOG.md`, `SECURITY.md`, `README.md`, `Dockerfile`,
`.github/workflows/{ci,codeql,dependency-review,deploy,publish}.yml`, `.github/dependabot.yml`,
`scripts/{release-prepare,verify-release-tag,extract-release-notes,docker-smoke}.mjs`,
`src/cli-release-readiness.ts`, `src/release/{release-closure-integrity,artifact-smoke}.ts`,
`src/server/deployment-mode.ts`, `src/access/hosted-limit-policy.ts`,
`docs/security/{BUNDLE_12_FINAL_ADVERSARIAL_AUDIT,SANDBOX_FINAL_ADVERSARIAL_AUDIT}.md`.

A repository-wide grep for `TODO|FIXME|HACK`, `coming soon`/`not implemented`/`contract only`, and
secret-shaped strings (`NPM_TOKEN`, `sk-...`, `ghp_...`, `github_pat_...`, PEM headers) found:

- Zero `TODO`/`FIXME`/`HACK` markers in non-test source.
- The only `not implemented` hit is a genuine, honest runtime error message
  (`sandbox-container-workspace.ts`) for an unsupported language — not a disguised stub.
- The only `contract only` hits in `docs/API_REFERENCE.md` (`POST /api/tools/run`,
  `GET /api/sessions/:id`) were independently re-verified in Bundle #13's final audit to have zero
  implementation anywhere in `src/` and remain correctly labeled.
- The only `NPM_TOKEN` reference is the expected `secrets.NPM_TOKEN` workflow reference in
  `publish.yml` — not a literal credential.
- No PEM/SSH private key material, no `sk-`/`ghp_`/`github_pat_`-shaped literal, anywhere in
  tracked source. (`dist/` and `coverage/` are confirmed `.gitignore`d and contain zero tracked
  files, so build/coverage artifacts were not a false-positive source.)

## 2. Evidence methodology

Every finding in every PR of this bundle is verified against the actual merged source, actual test
output, actual GitHub API responses, or actual external registry/API responses at the time of
verification — never against a PR title, PR body, commit message, or an earlier report's stated
conclusion. Verdicts use exactly these four values throughout the bundle:

- **PASS** — source and available runtime evidence support the claim.
- **FAIL** — evidence disproves the claim, or a release-blocking defect remains.
- **BLOCKED** — required evidence (a credential, a running daemon, a repository setting, external
  infrastructure) could not be obtained in the verifying environment.
- **NOT RUN** — the check was outside the available execution environment or explicitly out of this
  bundle's scope.

A missing credential, an absent Docker daemon, an unavailable external service, or a skipped live
test is **never** reported as PASS. Where this plan or a PR body says "verified," it means the
claim was checked against a live command, a live API response, or an on-disk artifact in this
session — not inferred.

## 3. Release target

| Deployment shape | Target verdict |
| --- | --- |
| Open-source technical preview | **GO** |
| Controlled self-hosted use | **GO** |
| Invite-only single-node hosted beta | **CONDITIONAL GO** |
| Multiple mutually untrusted grants on one node | carried from Bundle #12/#13 evidence, re-verified in PR 6 |
| Anonymous public self-service hosted SaaS | **out of scope / NO-GO** |
| Horizontally scaled / multi-tenant SaaS | **out of scope / NO-GO** |

This bundle does not add product capability. Every task below exists to prove one of: release
identity, secret-scan cleanliness, live external-integration truth, state continuity, artifact
publication truth, or final adversarial closure. A task that does not map to one of those six
purposes is out of scope for Bundle #14, full stop — including broad rebrand work, architecture
rewrites, unrelated UI work, a billing system, customer accounts, a distributed control plane, or
any new agent capability.

## 4. Six-PR dependency graph

```
PR 1  Release Candidate Identity and Evidence Contract
  │   (release-candidate.json schema + RELEASE_CANDIDATE_CONTRACT gate + release:verify-candidate)
  ▼
PR 2  Dedicated Secret and Credential Exposure Scanning
  │   (independent of PR 1's manifest fields, but PR 1's evidence-fail-closed pattern is reused)
  ▼
PR 3  Real External Integration Release Smoke
  │   (credential-gated; targets an exact commit/candidate/tarball/digest identity from PR 1)
  ▼
PR 4  State Backup, Restore, Restart, and Rollback Proof
  │   (independent subsystem; sequenced after PR 3 only to keep bundle review load manageable)
  ▼
PR 5  Publish, Deploy, and Post-Publication Verification
  │   (records packageTarballSha256 / containerDigest into the PR 1 manifest fields for real;
  │    depends on PR 1's manifest shape, PR 2's scan gates, PR 3's smoke harness pattern)
  ▼
PR 6  Final Adversarial Audit, Release Cut, and Closure
      (independently re-audits PRs 1–5, fixes any real finding, prepares 0.3.0, writes the
       final audit, and is the only PR that touches CHANGELOG.md's version header)
```

Each PR is opened as a draft against `origin/main` as it stood *after* the previous PR's merge —
this plan does not assume PR numbers in advance; the actual GitHub-assigned numbers are used and
reported at open time.

## 5. Thirty-six tracked tasks

### PR 1 — Release Candidate Identity and Evidence Contract

1. Add a versioned release-candidate manifest schema (`release-candidate.json` at the repository
   root, typed by `src/release/release-candidate.ts`) recording package name, candidate version,
   source commit SHA, package-lock version, creation date, expected npm package name, expected
   GHCR image, audit-document path, test evidence, an optional package-tarball SHA-256, an optional
   container digest, and a release verdict.
2. Add `npm run release:verify-candidate` (`src/cli-release-candidate-verify.ts`) — a deterministic
   verifier that fails closed on a missing, malformed, stale, contradictory, or self-inconsistent
   manifest, including a best-effort git-history reachability check on the recorded source commit
   SHA.
3. Extend `assessReleaseReadiness` with a new `RELEASE_CANDIDATE_CONTRACT` gate so a *formal*
   candidate cannot pass when package/lockfile versions differ (existing `PACKAGE_LOCK_CONTRACT`
   gate), the changelog lacks the matching version (existing `CHANGELOG_CURRENT` gate), the
   manifest points to the wrong/stale/unreachable source SHA (new), required evidence fields are
   absent (new), the referenced audit document's verdict is not PASS (new), temporary bundle
   machinery exists (existing `release-closure-integrity` check, already wired into
   `release-readiness`), or the manifest claims a PASS verdict without a recorded, validly
   formatted tarball checksum and container digest (new).
4. Keep normal `[Unreleased]` development un-gated: the new `RELEASE_CANDIDATE_CONTRACT` gate PASSes
   with `manifestPresent: false` when no manifest exists at all, so ordinary PRs are never blocked
   by a candidate contract they have no reason to satisfy. Only `release:verify-candidate` (used at
   actual release-preparation time, not in ordinary CI) requires a manifest to exist.
5. Comprehensive tests: malformed JSON, a stale/unreachable/malformed source SHA, package/lockfile
   version mismatch, missing audit evidence, an invalid verdict enum value, a PASS verdict with
   unrecorded/mutable artifact references, and the legitimate no-manifest development-mode path.
6. Document the exact candidate lifecycle in `docs/release/RELEASE_CANDIDATE_MANIFEST.md`: when the
   manifest is authored (after `release:prepare` bumps the version, before tagging), what each
   field means, and an explicit statement that the manifest's presence does **not** mean an
   artifact has been published — `packageTarballSha256`/`containerDigest` are only populated once
   PR 5's real publish pipeline records them.

### PR 2 — Dedicated Secret and Credential Exposure Scanning

7. Select a maintained secret scanner; pin every external Action to an immutable commit SHA and
   every downloaded tool to a checksum or lockfile-pinned version — no floating tags.
8. Scan the complete reachable git history, not only the current working tree.
9. Scan the exact `npm pack` tarball contents (reusing/extending `runNpmPackSmoke`'s tarball rather
   than re-packing separately, so the scanned artifact is the one that would actually publish).
10. Scan the built production container filesystem (reusing `runDockerSmoke`'s built image).
11. Redaction tests proving representative provider/GitHub/npm/access-grant/private-key-shaped
    strings are redacted in logs, mission evidence, provider-test responses, sandbox audit records,
    and workflow artifacts.
12. Record a release-evidence output: scanner version, ruleset identity, source SHA, scanned
    surfaces, PASS/FAIL, and a redacted findings summary — never the full secret match.

### PR 3 — Real External Integration Release Smoke

13. Add a credential-gated, `environment`-protected, manually invoked workflow (or equivalent
    operator command) that targets an exact commit, release candidate, tarball, or container
    digest — never arbitrary fork/PR code.
14. Prove one real supported provider path end to end against a real credential (bounded chat,
    bounded agent task, usage recorded, cancellation/timeout limits honored, redaction verified).
15. Prove the real browser journey against the packaged/containerized server using a browser
    automation harness (start → auth → Settings → provider test → Agent → bounded task → mission
    status → no console fatals).
16. Prove one real GitHub repository journey against a disposable fixture repository (intake →
    mission → safe fixture edit → validate → branch → commit → push → draft PR → mission PR
    reference → cleanup).
17. Guarantee the workflow never runs on arbitrary PR code and never exposes credentials to forks,
    logs, screenshots, artifacts, or PR comments.
18. Produce a redacted machine-readable smoke report: source SHA, artifact identity, provider type,
    fixture repository, journey steps, PASS/FAIL/BLOCKED per journey, created branch/PR IDs, cleanup
    result, timestamps. When credentials/fixture repo are unconfigured, the live result is
    **BLOCKED**, never PASS-by-omission.

### PR 4 — State Backup, Restore, Restart, and Rollback Proof

19. Define the authoritative state inventory for a single-node install (missions, events,
    checkpoints, delegated grants, sessions, approvals, audit records, governance SQLite data,
    network policies, dependency-layer bindings, egress audit logs, memory stores, repository
    intake metadata, operator configuration excluding external secrets).
20. Add a safe operator backup command: writes outside the live state root, refuses symlink/
    traversal targets, produces a manifest and checksums, never copies raw externally managed
    provider credentials, handles SQLite consistently, fails closed on a partial backup.
21. Add a restore-verification command/harness that restores into a clean temporary state root and
    verifies integrity before allowing startup — never mutating the live state root it read from.
22. Add restart/recovery tests proving missions, grants, governance totals, policies, audit
    evidence, and dependency bindings remain readable after restart.
23. Add rollback smoke: start the previous compatible image/package against a copied snapshot, or
    truthfully report schema incompatibility before any mutation.
24. Write a disaster-recovery runbook: backup, restore, rollback, key rotation, grant revocation,
    corrupt-state handling, evidence retention, recovery verification.

### PR 5 — Publish, Deploy, and Post-Publication Verification

25. Review/harden publish and deploy workflow permissions, triggers, concurrency, and environment
    use.
26. Ensure release workflows validate: the immutable tag, package version, lockfile version,
    changelog version, source commit, the PR 1 release-candidate manifest, the PR 6 final audit
    verdict, PR 2's secret-scan evidence, PR 3's external-smoke evidence, and PR 4's
    state-continuity evidence.
27. Generate and record real artifact identities: npm tarball filename + SHA-256, GHCR repository +
    immutable digest, source commit SHA, release tag — and write the tarball checksum and container
    digest back into the PR 1 manifest fields left empty until now.
28. After real npm publication, install the exact public version into a fresh temporary project and
    run the canonical package binaries against their real contracts.
29. After real GHCR publication, pull the exact immutable digest into a clean runner and run local
    and hosted Docker smoke against that digest specifically (not a locally rebuilt image).
30. Produce a final release-evidence artifact containing only redacted operational metadata and
    immutable identifiers.

Also in PR 5: a documented, code-cannot-enforce operator verification checklist for required CI
checks, required CodeQL, required Dependency Review, branch force-push/deletion protection, release
environment approval, npm credential scope, tag immutability policy, private vulnerability
reporting, and GHCR visibility — never reported PASS without GitHub-API or explicit operator
evidence.

### PR 6 — Final Adversarial Audit, Release Cut, and Closure

31. Independently audit the merged code from PRs 1–5 from source, not from their PR descriptions.
32. Re-run and inspect the complete validation matrix (§6) plus every bundle-specific gate added by
    PRs 1–5, including whichever live external/state/publication smoke evidence is obtainable in
    the auditing environment — anything not obtainable is BLOCKED, not PASS.
33. Confirm CI, CodeQL, Dependency Review, and all bundle-added required workflows are green on the
    exact final head.
34. Prepare the real release version via `npm run release:prepare` (expected `0.3.0` given the
    current `0.2.0` and no conflicting release, but verified against actual semantic-version intent
    at that time, not assumed blindly).
35. Replace `[Unreleased]` with the dated release section, finalize the candidate manifest, and bind
    the audit to the exact audited and correction-validation SHAs without an impossible
    self-referential commit hash (the manifest/audit reference an ancestor commit, never the commit
    that introduces them).
36. Write `docs/security/PUBLIC_TECHNICAL_PREVIEW_RELEASE_AUDIT.md` with the full verdict matrix
    (open-source technical preview, controlled self-hosted, invite-only single-node hosted beta,
    multiple mutually untrusted grants on one node, anonymous public self-service SaaS, horizontally
    scaled service, commercial multi-tenant SaaS), residual limitations, and the final GO/NO-GO.

## 6. Bundle-wide validation standard

Every PR runs, at minimum:

```
npm ci
npm run audit
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
npm run build
npm run release-readiness
```

plus its own PR-specific tests, with focused unit tests, negative tests, failure-path tests, and
redaction tests wherever secrets or external systems are involved. Coverage thresholds are never
reduced to make a PR merge more easily.

## 7. Required external credentials and infrastructure (tracked, not assumed available)

- A real provider API credential (PR 3, task 14) — **BLOCKED** in this session unless the operator
  configures one in a protected GitHub Environment.
- A disposable GitHub fixture repository for the live GitHub journey (PR 3, task 16) — **BLOCKED**
  in this session until the operator provisions and names one.
- A Docker daemon for local strong-sandbox/Docker-smoke gates — available in real GitHub Actions CI
  (confirmed by the `ci.yml`/`deploy.yml` jobs pulling a digest-pinned image), but **BLOCKED** for
  direct execution inside this authoring session unless later confirmed otherwise.
- GHCR pull/push credentials for PR 5's real-artifact verification — provided automatically to
  `deploy.yml` via `secrets.GITHUB_TOKEN`; independent verification from an external puller (PR 5,
  task 29) needs anonymous or token-based pull access, tracked as a PR 5 task, not assumed here.
- npm publish credentials (`secrets.NPM_TOKEN`) — already referenced by `publish.yml`; whether it is
  actually configured in repository secrets is an operator-verified item (§7 above), not something
  this session can read.
- Repository-settings read access (branch protection, environments, private vulnerability
  reporting, GHCR visibility) — not exposed by the GitHub MCP tools available in this session;
  tracked as an operator checklist in PR 5.

## 8. Cleanup requirements (every PR, checked before opening as draft)

- No temporary, self-modifying, or marker-triggered workflow.
- No `contents: write` workflow permission without a narrowly proven, documented requirement.
- Every third-party Action pinned to an immutable 40-character commit SHA.
- No trigger file, workplan, patch builder, findings ledger, draft marker, or diagnostic workflow
  left in the final tree — verified with `node dist/cli-release-closure.js`, which already
  generalizes past any single bundle number (Bundle #13, PR #348).
- No raw secret, provider key, npm credential, GitHub token, installation token, session
  credential, access grant, or raw secret-bearing request/response body in logs, evidence, or
  committed source.

## 9. Final release acceptance gate

The bundle is not "done" merely because PR 6 merges. The operator-controlled release sequence in
the kickoff prompt's §6 (`release:prepare` → `validate` → `release:verify-candidate` → `git tag` →
push) is the actual release trigger, and is only run after PR 6's exact merge SHA is independently
verified. Publish-workflow PASS, deploy-workflow PASS, npm public-install smoke PASS, GHCR
pull-by-digest smoke PASS, accurate GitHub Release notes, a finalized release-candidate manifest, an
accessible final audit, and zero post-tag source drift are all required before this bundle is
considered released, not merely merged.
