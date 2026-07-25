# CodeMind Runtime Report Surface Registry

The surface registry provides static discovery metadata for all report surfaces.

## Registry location

```txt
src/runtime/workflow/runtime-report-surface-registry.ts
```

## Registered surfaces

```txt
zflow-report                    (model) — single execution report
zflow-report-catalog            (model) — grouped report catalog
zflow-report-suite              (model) — suite rollup
zflow-report-rollup             (tool)  — rollup runtime tool
runtime-report-index            (model) — cross-surface index
runtime-report-note             (model) — operator summary note
runtime-report-bundle-manifest  (model) — bundle manifest
runtime-report-collection       (model) — grouped collection
runtime-report-hub              (model) — central hub
cli-runtime-report-index        (cli)   — index fixture renderer
cli-runtime-report-note         (cli)   — note fixture renderer
cli-runtime-report-collection   (cli)   — collection fixture renderer
cli-runtime-report-hub          (cli)   — hub fixture renderer
```

## Entry fields

Each registry entry includes:

```txt
name        — unique surface identifier
kind        — model, renderer, tool, or cli
module      — source file path
formats     — supported output formats (markdown, json)
safetyFlags — read-only safety guarantees
```

## Output formats

```txt
markdown — operator-readable surface listing
json     — structured registry data
```

## Safety boundary

The registry is static data only.

It does not:

```txt
import or execute registered surfaces
write files
access network
call providers
```
