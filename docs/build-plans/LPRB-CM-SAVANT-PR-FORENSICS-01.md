# LPRB-CM-SAVANT-PR-FORENSICS-01

## Savant Forensic PR Preflight Runtime & CI Failure Prevention Engine

Status: GREENLIGHT for additive implementation.

This bundle adds a deterministic forensic preflight layer without replacing CodeMind's existing release-readiness CLI gate.

## Existing CodeMind Surfaces Preserved

- `package.json` is not modified.
- The existing `release-readiness` command remains the canonical release gate.
- No duplicate readiness script is added.
- Existing CI workflow structure is preserved.

## Additive Runtime

The new runtime adds:

- changed-file classification
- package manager detection
- CI failure ledger loading and shape validation
- active failure pattern matching
- validation plan generation
- command evidence collection through injected evidence providers
- readiness evaluation from real evidence

## Pipeline

```text
changed files
→ file classification
→ ledger loading
→ active failure matching
→ validation planning
→ command evidence collection
→ readiness evaluation
→ push recommendation
```

## Rules

1. Missing scripts are missing, never passed.
2. Unknown or conflicting package managers block evidence collection.
3. Package, lockfile, and workflow changes require CodeMind's existing `release-readiness` proof.
4. Matched failure-ledger records inject prevention checks.
5. The ledger must be valid machine-readable JSON.
6. No READY verdict is possible when required evidence is omitted, missing, blocked, or failed.

## Files Added

- `.codemind/ci-failure-ledger.json`
- `src/forensics/types.ts`
- `src/forensics/file-classifier.ts`
- `src/forensics/package-manager.ts`
- `src/forensics/failure-ledger.ts`
- `src/forensics/validation-planner.ts`
- `src/forensics/command-evidence.ts`
- `src/forensics/readiness-evaluator.ts`
- `src/forensics/preflight-report.ts`
- `tests/forensics/file-classifier.test.ts`
- `tests/forensics/package-manager.test.ts`
- `tests/forensics/failure-ledger.test.ts`
- `tests/forensics/command-evidence.test.ts`

## Validation Required Before Merge

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run release-readiness
```

No final READY claim should be made until those commands pass in the real repository.
