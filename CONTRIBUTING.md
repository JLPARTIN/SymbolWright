# Contributing to SymbolWright

Thanks for your interest in contributing. This document covers the practical setup and workflow;
for how we expect people to treat each other, see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). For
reporting a security vulnerability, see [`SECURITY.md`](SECURITY.md) instead of opening a public
issue.

## Before you start

- For small fixes (typos, obvious bugs, docs), just open a PR.
- For anything larger — a new feature, a change to the delegated-access or authorization model, a
  new provider adapter, a change to the runtime/mission execution model — please open an issue or
  discussion first. This project has a deliberate trust model (see
  [`docs/security/DELEGATED_AGENT_ACCESS.md`](docs/security/DELEGATED_AGENT_ACCESS.md)) and a large
  existing test surface; aligning on approach before writing code saves everyone time.

## Development setup

Requirements: Node.js `>=22.5.0` (see `package.json` `engines`) and npm.

```bash
git clone https://github.com/JLPARTIN/SymbolWright.git
cd SymbolWright
npm install
npm run build
```

Set at least one provider credential to exercise AI-backed features locally (see
[`docs/PROVIDER_KEYS.md`](docs/PROVIDER_KEYS.md) for the full list):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Copy [`.env.example`](.env.example) to `.env` if you want to keep local credentials out of your
shell history; `.env` is gitignored.

## Running checks locally

Run whichever of these apply to your change before opening a PR — CI runs all of them:

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src/
npm run format:check   # prettier --check src/  (use `npm run format` to auto-fix)
npm test               # vitest run
npm run test:coverage  # vitest run --coverage
npm run build          # tsc build
```

`npm run validate` runs the full sequence CI enforces (audit, typecheck, lint, format, coverage,
build, release-readiness) and is what `prepublishOnly` runs before a release.

## Tests

- New behavior needs test coverage. Look for the `*.spec.ts` file next to the module you're
  changing for the existing conventions (fixture setup, temp-directory workspaces, fake
  clocks/transports) before inventing new patterns.
- Prefer testing through the same entry point a real caller would use (a service method, an HTTP
  route) over reaching into internals.
- Keep tests deterministic: inject a fake clock (`() => Date`) instead of sleeping, use
  `mkdtempSync` for filesystem state, and avoid real network calls.

## Code style

- TypeScript, strict mode, `exactOptionalPropertyTypes: true` — build optional fields with
  conditional spreads (`...(x === undefined ? {} : { x })`) rather than assigning `undefined`
  directly; see existing code for the pattern.
- Formatting is Prettier-enforced (`npm run format:check` in CI) — don't hand-format, run
  `npm run format`.
- Follow existing naming and module boundaries rather than introducing a new pattern for something
  that already has one.
- Comments should explain *why*, not *what* — avoid narrating obvious code, and don't reference a
  specific PR/issue number or "added for X fix" in a comment; that context belongs in the PR
  description.

## Security-sensitive areas

Changes to the following get extra scrutiny, since they're the platform's trust boundary:

- `src/access/` — delegated agent grants, authentication, authorization.
- `src/github/` — GitHub App/token handling.
- `src/sandbox/` — sandboxed command execution.
- `src/runtime/` — repository mutation, protected-path enforcement, containment.

If your change touches any of these, explain the security reasoning in the PR description, not just
the mechanics of the change.

## Commit / PR conventions

- Keep commits focused; a PR that does one coherent thing is easier to review than one that mixes
  a refactor with a feature.
- Write commit messages and PR descriptions that explain *why*, matching this repo's existing
  history (`git log --oneline` for examples).
- Fill in the PR template's Summary, Changes, and Test plan sections.
- Don't commit anything under `.symbolwright/` (local runtime state — grants, credentials, sessions,
  memory, missions) or `.env` — both are gitignored for a reason.

## Questions

Open a GitHub issue or discussion. There's no separate chat/forum for this project yet.
