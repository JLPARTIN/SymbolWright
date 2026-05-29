# PR-CM-AJNA-05: Ajna Review Report Composer

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-05` / `PR-CM-AJNA-05` / `CODEMIND-AJNA-05`

## Summary

Composes human-readable Ajna review reports in plain, markdown, and compact
formats. Output is backend-only — not posted to GitHub.

## Files

- `src/ajna/ajna-review-report-composer.ts` — implementation
- `src/ajna/ajna-review-report-composer.spec.ts` — 14 tests

## Sections Rendered

- Ajna Review Header
- Repository / PR Identity (repository, PR number, head SHA, base SHA, session ID)
- Proof Bundle Summary (gate status, missing/blocked/invalid domains)
- Risk Synthesis (level + explanation)
- Merge Decision (state + reasons)
- Runtime Boundary status (invariants)
- Validation commands

`renderedAt` is optional — omitting it produces fully deterministic output.

## Validation

```bash
npm run typecheck
npm test
npm run build
```
