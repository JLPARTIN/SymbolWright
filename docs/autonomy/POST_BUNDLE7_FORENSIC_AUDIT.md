# Post-Bundle #7 Forensic Audit

## Audit target

- Repository: `JLPARTIN/CodeMind`
- Audited merged commit: `a9f784ef3f6b1df8119991ccf4526f0a2f3f4480`
- Scope: whether Bundle #7's claimed universal repository portability, policy-gated web
  research, and Docker-routed validation are actually reachable from the live server
  autonomy path (not only exercised by tests), and whether the security and evidence
  invariants documented in `BUNDLE7_UNIVERSAL_REPOSITORY_PORTABILITY.md` hold in the
  production wiring.

This audit inspected production callers and state transitions. Passing tests and PR
descriptions were treated as evidence, not as proof that a feature was
operator-accessible, following the same discipline as `POST_BUNDLE6_FORENSIC_AUDIT.md`.

## Verdict before correction

Bundle #7's discovery, portable Docker validation, and research subsystems are
genuinely wired into the live path — `src/app/api/mission-routes.ts` constructs the
autonomy runtime through `createServerAutonomyRuntime`, which discovers validation
commands from the real repository unless a caller supplies an explicit list, and
`RuntimeAutonomousValidationRunner` defaults to a real `DockerPortableValidationRunner`
rather than a test double. No Bundle-6-style "disconnected feature" defect was found in
this bundle's own new surface.

One release-blocking observability defect was found, predating Bundle #7 but widened by
it, plus two defense-in-depth gaps.

### F1 — High: the entire autonomous mission event category was invisible under every Timeline filter except "All"

`eventMatchesFilter` in `src/mission/mission-events.ts` matched events by type prefix
into buckets (`agent.`, `workspace.`, `validation.`, `git.`/`github.`, `checkpoint.`,
`memory.`, `web.`/`mcp.`, `subagent.`/`skill.`), but every event emitted by the
autonomous mission runtime — `autonomy.plan.created`, `autonomy.execution.*`,
`autonomy.task.evidence`, `autonomy.validation.passed`/`failed`, `autonomy.repair.*`,
`autonomy.release.generated`, `autonomy.control.*`, and Bundle #7's own
`autonomy.portability.detected`/`autonomy.portability.researched` — used the
`autonomy.` prefix, which no filter bucket checked for. The operator-facing Missions
view (`src/app/views/missions-view.ts`) renders the Timeline through this exact filter
function against the real `/api/missions/:id/events` endpoint, so selecting any category
other than "All" silently hid every autonomous-mission event, including Bundle #7's new
portability-detection and research evidence. This is the same class of defect as
Bundle #6's F2 (claimed observability not actually reachable through the UI) — here the
UI path existed and rendered real data, but a missing filter bucket made most of it
disappear under normal use.

**Correction:** added an `autonomy` bucket to `MISSION_EVENT_FILTERS` and
`eventMatchesFilter` (`src/mission/mission-events.ts`), matching the `autonomy.` prefix.
`src/app/views/missions-view.ts` previously hard-coded its own duplicate copy of the
filter list and labels (`MISSION_FILTERS`) instead of importing the canonical
`MISSION_EVENT_FILTERS`; it now imports `MISSION_EVENT_FILTERS` and the new
`MISSION_EVENT_FILTER_LABELS` map directly, so the two lists cannot drift apart again and
the new bucket appears automatically. Added filter-matching coverage in
`mission-events.spec.ts`, a rendered-option assertion in `missions-view.spec.ts`, and
extended the exhaustive per-filter count fixture in `mission-branch-coverage.spec.ts`.

### F2 — Low: research-marker discovery had no file-count bound

`findResearchMarkers` in `src/portability/universal-repository-portability.ts` walked
the full repository tree bounded only by `maxDepth`, unlike its sibling
`inventoryRepository` in `repository-portability.ts`, which also caps total files
visited at `maxFiles` (default 20,000). Both walks run concurrently
(`Promise.all`) over the same tree, so a pathological or adversarial repository
(extremely wide flat directories) could make the unbounded walk the long pole.

**Correction:** `findResearchMarkers` now accepts and enforces the same `maxFiles`
bound as the primary inventory walk, using the same default.

### F3 — Informational: legacy allowlist overlap with discovered Node commands is inconsistent but not unsafe

`RuntimeAutonomousValidationRunner` routes a command through the pre-Bundle-7 sandbox
runner instead of the portable Docker runner when it exactly matches
`ALLOWLISTED_VALIDATION_COMMANDS` (`npm run typecheck`, `npm test`, `npm run
test:coverage`, `npm run lint`, `npm run audit`, `npm run build`, `npm run build:app`)
at the repository root. Discovery always emits `npm run <script>` (never the bare `npm
test`), so a discovered `test` phase command never actually matches the legacy list even
though `typecheck`/`lint`/`build`/`audit` phases can. Both code paths route through
policy-gated, Dockerized sandboxes with equivalent isolation, so this has no safety
impact — it is a naming inconsistency between two overlapping allowlists, not a defect.
No correction applied; left as a note for a future cleanup pass rather than a
release-blocking item.

## Safety invariants re-verified

- Discovery (`repository-portability.ts`, `universal-repository-portability.ts`) skips
  symlinked entries and the standard dependency/build/state directories
  (`node_modules`, `.git`, `.codemind`, `dist`, `build`, `coverage`, `target`, `.venv`,
  `venv`, `__pycache__`, `.gradle`, `.idea`, `.next`, `vendor`) in both the primary
  inventory walk and the research-marker walk.
- `isSafePortableValidationCommand` rejects shell metacharacters
  (`; & | \` $ < > \n \r`) and only allows a fixed set of per-ecosystem command shapes;
  `ciWorkflowCommands` re-validates every candidate pulled from a GitHub Actions `run:`
  step against the same allowlist before treating it as validation evidence.
- `resolvePortableValidationRoot` rejects any working directory that resolves outside
  the repository root (absolute paths and `..` segments are both rejected before path
  resolution), so nested package roots cannot escape the mounted workspace.
- `DockerPortableValidationRunner` never falls back to host execution — a missing or
  unreachable Docker daemon returns `ERROR` with an explicit "host execution is not
  allowed" reason, and every invocation sets `--cap-drop=ALL`,
  `--security-opt=no-new-privileges:true`, `--network none`, and bounded
  `--memory`/`--cpus`, with output hard-capped and the process killed on overflow.
  `--user` resolves to the host UID:GID (matching the existing sandbox runner's fix for
  bind-mount permission mismatches), and stdout/stderr are redacted before being
  returned.
- Web research (`repository-portability-research.ts`) only ever returns
  `{ queries, evidence, guidance }`; nothing it returns is merged back into
  `validationCommands` anywhere in the codebase, and research markers
  (`Package.swift`, `pubspec.yaml`, `mix.exs`, `CMakeLists.txt`, `Makefile`,
  `build.zig`) are not mapped to an ecosystem by `expandMonorepoValidation`'s
  `ecosystemForManifest`, so they cannot expand into executable validation commands.
- A repository with zero discovered validation commands (an unsupported ecosystem, or
  research markers only) cannot produce a false merge-ready release:
  `createMissionAcceptancePacket` requires `validationTasks.length > 0` before
  `validation.passed` can be `true`, so an empty validation task list — the same
  pattern the Bundle #6 audit's F5 correction targeted — is `passed: false` by
  construction, which `releaseState` maps to `blocked`, never `merge-ready`.

## Verification trial

Re-ran the exact production call chain the live server uses:
`src/app/api/mission-routes.ts` → `createServerAutonomyRuntime` →
`resolveValidationCommands` → `discoverUniversalRepositoryPortability` →
`RuntimeAutonomousValidationRunner` → `DockerPortableValidationRunner`, confirming each
link by reading the real (non-test) source rather than inferring behavior from
`server-autonomy-portability.integration.spec.ts` alone. Confirmed the Missions view's
Timeline fetches the real `/api/missions/:id/events` endpoint and renders `event.type`
and `event.summary` generically (no per-type allowlist at the render layer, only at the
now-corrected filter layer).

## Completion standard

The post-Bundle #7 forensic correction is complete when all of the following pass on
the hardening branch:

- dependency audit;
- strict TypeScript typecheck;
- ESLint;
- Prettier check;
- sandbox contract tests;
- full test suite and coverage thresholds;
- production build;
- PR preflight;
- aggregate `npm run validate` release gate.

Bundle #7 should be described as **forensically closed** once those gates pass with the
F1/F2 corrections included. F3 remains a documented, non-blocking cleanup note.
