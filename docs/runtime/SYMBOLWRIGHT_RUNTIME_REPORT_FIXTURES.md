# SymbolWright Runtime Report Fixtures

All CLI renderers read JSON fixture files as input. This document describes the shared fixture format.

## Common fixture fields

Every CLI fixture requires:

```txt
title  — non-empty string identifying the report
format — "markdown" or "json"
```

Optional common field:

```txt
generatedAt — ISO 8601 timestamp string
```

## Fixture parsing guards

All CLI renderers use shared parsing utilities from:

```txt
src/runtime/workflow/runtime-report-fixture-guards.ts
```

Shared guards:

```txt
assertRecord         — validates value is a non-null object
parseFixtureFormat   — validates format is "markdown" or "json"
parseFixtureTitle    — validates title is a non-empty string
parseFixtureGeneratedAt — validates generatedAt is a string when present
parseOptionalArray   — validates optional array with object items
parseOptionalRecord  — validates optional single object
loadFixtureFile      — reads and parses JSON from file path
```

## Fixture examples by surface

### Report index fixture

```json
{
  "title": "Runtime Report Index",
  "format": "markdown",
  "reports": [{ "id": "r-1", "..." : "..." }]
}
```

### Report note fixture

```json
{
  "title": "Operator Note",
  "format": "markdown",
  "index": { "title": "Index", "..." : "..." }
}
```

### Report collection fixture

```json
{
  "title": "Report Collection",
  "format": "json",
  "indexes": [],
  "notes": [],
  "manifests": []
}
```

### Report hub fixture

```json
{
  "title": "Report Hub",
  "format": "markdown",
  "indexes": [],
  "notes": [],
  "manifests": [],
  "collections": []
}
```

## Validation behavior

Invalid fixtures produce clear error messages:

```txt
Non-object root        — "Fixture must be a JSON object."
Missing title          — "Fixture must include a non-empty "title" field."
Bad format             — "Fixture format must be "markdown" or "json"."
Bad generatedAt        — "Fixture "generatedAt" field must be a string when supplied."
Non-array field        — "Fixture "<name>" field must be an array when supplied."
Non-object array item  — "Fixture <name> item <N> must be an object."
```

## Safety boundary

Fixture loading reads JSON files only.

It does not:

```txt
write files
execute commands
access network
call providers
```
