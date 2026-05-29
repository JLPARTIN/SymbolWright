# PR-CM-AJNA-02: Ajna Proof Bundle Aggregator

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-02` / `PR-CM-AJNA-02` / `CODEMIND-AJNA-02`

## Summary

Aggregates all six Proof Harness domain statuses into one Ajna-readable
bundle. Connects the completed TEST block to the Ajna review pipeline.

## Files

- `src/ajna/ajna-proof-bundle.ts` — implementation
- `src/ajna/ajna-proof-bundle.spec.ts` — 13 tests

## Design

`buildAjnaProofBundle(input)` accepts optional status strings for each of
the six proof domains. Absent domains are treated as `MISSING`.

Classification rules (applied in domain-label order for determinism):
- `MISSING` — domain status was not supplied
- contains `BLOCKED` → added to `blockingProofDomains`
- contains `INVALID` → added to `invalidProofDomains`

`proofGateStatus` is `PROOF_GATE_OPEN` only when all six domains match
their exact ready value and no domain is missing, blocked, or invalid.
`allProofReady` mirrors `proofGateStatus`.

## Validation

```bash
npm run typecheck
npm test
npm run build
```
