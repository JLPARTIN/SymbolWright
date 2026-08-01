# Dedicated Secret and Credential Exposure Scanning

This document describes SymbolWright's dedicated secret-scanning gate, part of
[Large PR Bundle #14](../release/LARGE_PR_BUNDLE_14_RELEASE_CANDIDATE_BUILD_PLAN.md). CodeQL and
`npm audit` do not scan for accidentally committed credentials — this closes that specific gap.

## Scanner choice

[secretlint](https://github.com/secretlint/secretlint) with
`@secretlint/secretlint-rule-preset-recommend`, installed as an exact-pinned (`--save-exact`) npm
devDependency. Its integrity is guaranteed the same way every other dependency in this repository
is — by `package-lock.json`'s recorded integrity hash — so no separate binary download, checksum
verification, or GitHub Action SHA pin is needed for the scanner itself. The recommend preset
bundles rules for GitHub tokens, npm tokens, private key headers, basic-auth-in-URL credentials,
AWS/GCP/Cloudflare/Stripe/Slack/OpenAI/Anthropic and other provider key shapes, and more.

Every third-party GitHub Action this bundle's own workflow (`secret-scan.yml`) uses
(`actions/checkout`, `actions/setup-node`) is pinned to the same immutable 40-character commit SHAs
already used elsewhere in this repository's other workflows — no new, separately-verified Action
pin was introduced.

## Scanned surfaces

| Surface | Command | What it scans |
| --- | --- | --- |
| Source | `npm run secret-scan:source` | Every `git ls-files`-tracked file in the working tree. |
| Git history | `npm run secret-scan:history` | A zero-context diff (`git log --all -p -U0`) of every reachable commit, scanned as one text blob. This surfaces every line ever added or removed across history without needing to materialize each historical blob individually — the same technique dedicated history scanners use. |
| npm pack tarball | `npm run secret-scan:npm-pack` | The exact tarball `npm publish` would upload (`npm pack`, extracted). `.map` source-map files are excluded — see "`.map` file exclusion" below. |
| Container filesystem | `npm run secret-scan:container` | The exported filesystem (`docker export`) of the image built from this repository's `Dockerfile`. Requires Docker; reported `BLOCKED` (not `PASS`) when unavailable, or `FAIL` when `SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE=1` is set (the same env var `ci.yml`/`deploy.yml` already use to demand real Docker evidence). |

All four are implemented in `src/release/secret-scan.ts` and share one execution/classification
core (`runSecretlintOnFiles`): exit code `0` is clean, `1` means real findings were parsed, and any
other exit code (a crashed scanner, a missing config) is reported as `FAIL` — never silently
reported as "no findings."

## Redaction

secretlint's own JSON output already redacts the matched value inside each `message` string (e.g.
`"found GitHub Token(...): ****************************************"`), but the same JSON payload
also includes a `sourceContent` field carrying the **entire scanned file's raw text**, including
any real secret verbatim. `SecretScanFinding` objects are reconstructed field-by-field from only
`filePath`, `ruleId`, `messageId`, `loc.start.line`, and the already-redacted `message` string —
`sourceContent` is never read into a finding, logged, or persisted anywhere. This is covered by a
dedicated test (`secret-scan.spec.ts`, "never includes the raw secret value or sourceContent").

## `.map` file exclusion

Source maps (`.map`) are excluded from the npm-pack and container filesystem scans. They are
generated positional-mapping data (base64 VLQ-encoded offsets), never authored content, and their
long encoded lines caused a catastrophic scan slowdown in testing: a full `dist/` scan including
`.map` files did not complete after six-plus minutes of CPU time, while the same tree excluding
`.map` files completed in under two minutes. Any real secret that could appear in a `.map` file
would already be present in the corresponding `.js` file, which is not excluded and is fully
scanned.

## Suppressing an intentional test fixture

Several existing tests intentionally construct secret-shaped strings (e.g. `ghp_...`,
`user:secret@host`) to prove the application's own redaction logic works — see
`*-redaction.spec.ts`, `mcp-redaction.spec.ts`, `validation-output-redactor.spec.ts`. These are
suppressed with secretlint's own `// secretlint-disable-next-line` / `// secretlint-disable-line`
comments, placed immediately adjacent to the exact line containing the fixture — never a
file-level or directory-level ignore. This keeps the allowlist narrow: if a real secret were later
added anywhere else in the same file, it would still be caught. Every suppression in this
repository is tied to a specific, reviewed, intentional test fixture; none exist for convenience.

**A suppression must be re-verified after compilation, not only in source.** TypeScript's compiled
output does not always preserve the exact line adjacency a disable comment relied on in the `.ts`
source (a shifted or reordered emitted line breaks the "next line" association). The npm-pack and
container surfaces scan the *compiled* `dist/` output, not the TypeScript source, so a suppression
that looks correct in `.ts` must still be confirmed clean against `dist/` before being trusted —
this was caught for real during this bundle's own work (see `secret-scan.spec.ts`'s test fixtures,
which needed additional suppressions once their compiled form was actually scanned).

## Historical findings: a known, reviewed, non-blocking condition

`npm run secret-scan:history` currently and truthfully reports **FAIL** for this repository. The
exact finding count is not pinned in this document, because it is not stable: the scan feeds the
entire zero-context diff of every reachable commit to secretlint as a single blob, and secretlint
deduplicates identical secret *values* within one scanned file, keeping only the first occurrence.
Since this repository's history reuses a small number of canonical fixture strings across many
commits, the reported count reflects the number of *distinct* fixture values secretlint has ever
seen in history, not the number of commits that introduced or touched one. Every finding observed
to date matches one of the same intentional, already-reviewed test-fixture shapes described above,
or is a benign documentation placeholder, not a credential. None represent a real leaked secret —
each new finding must still be individually confirmed as such when it appears, not assumed from
this note.

Per this bundle's own rules, **history is not rewritten to remove these without explicit operator
instruction** — a squash or history-filtering operation is a decision for the repository owner, not
one this scan or its automation makes unilaterally. The `secret-scan.yml` workflow's `history` job
therefore runs the scan for real on every push/PR (its full output is captured in the job log for
review) but uses `continue-on-error: true` so this known, already-reviewed condition does not block
merges the way a genuine regression would. The `source`, `npm-pack`, and `container` jobs are not
marked `continue-on-error` and do gate normally.

## Release evidence

`buildSecretScanReleaseEvidence`/`renderSecretScanReleaseEvidence` (`src/release/secret-scan.ts`)
produce a redacted, machine-readable record for a set of scan results: secretlint's own version,
the installed rule preset's identity (`@secretlint/secretlint-rule-preset-recommend@<version>`),
the exact source commit SHA, a per-surface status/detail/finding-count breakdown, an overall status
(worst-of: `FAIL` > `BLOCKED` > `PASS`), and a findings summary built only from the redacted fields
described above.
