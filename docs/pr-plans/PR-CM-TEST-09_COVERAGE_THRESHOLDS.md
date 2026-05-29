# PR-CM-TEST-09: Coverage Thresholds

## Summary

Adds v8 coverage thresholds and watch/coverage scripts to enforce minimum
test coverage across the CodeMind codebase.

## Files

- `vitest.config.ts` — adds `reporter` and `thresholds` to the existing coverage block
- `package.json` — adds `test:watch` and `test:coverage` scripts

## Changes

### `vitest.config.ts`

Added to `test.coverage`:

```ts
reporter: ['text', 'json', 'html'],
thresholds: {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80,
},
```

### `package.json`

New scripts:

```json
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

## Validation

```bash
npm run typecheck
npm test
npm run build
```

To run with coverage:

```bash
npm run test:coverage
```
