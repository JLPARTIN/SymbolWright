# Bundle #7 — Universal Repository Portability

Bundle #7 removes the live autonomy runtime's assumption that every repository is a Node project.

## Production flow

For every new autonomous mission, CodeMind now:

1. inventories the repository without following symlinks or scanning dependency/build/state directories;
2. detects ecosystem manifests and meaningful source-language signals;
3. identifies mixed repositories and nested package roots;
4. discovers bounded build, test, lint, format, typecheck, and audit commands from manifests, conventions, and simple GitHub Actions `run:` steps;
5. rejects shell metacharacters and commands outside the portable validation allowlist;
6. creates package-root validation tasks in the durable mission graph;
7. executes each portable command in an ecosystem-specific Docker image with no network, dropped capabilities, bounded CPU/memory/time/output, and the repository mounted as the workspace;
8. reuses those exact commands for autonomous repair, impact analysis, acceptance, and release evidence.

Explicit operator-supplied `validationCommands` still override discovery.

## Supported ecosystems

| Ecosystem | Primary evidence | Validation image |
| --- | --- | --- |
| Node.js / TypeScript / JavaScript | `package.json`, scripts, JS/TS source | `node:22-bookworm` |
| Python | `pyproject.toml`, requirements/setup/tox files, Python source | `python:3.12-bookworm` |
| Go | `go.mod`, Go source | `golang:1-bookworm` |
| Rust | `Cargo.toml`, Rust source | `rust:1-bookworm` |
| Java / Maven | `pom.xml`, `mvnw`, Java source | `maven:3-eclipse-temurin-21` |
| Java / Gradle | Gradle manifests/wrapper, Java source | `gradle:8-jdk21` |
| .NET | solution/project files, C# source | `mcr.microsoft.com/dotnet/sdk:8.0` |
| Ruby | `Gemfile`, Ruby source | `ruby:3.3-bookworm` |
| PHP | `composer.json`, PHP source | `composer:2` |

Nested manifests produce validation tasks rooted at their own package directories. No `cd`, shell pipeline, command substitution, or host-shell fallback is used.

## Policy-gated web research

When local evidence does not identify a supported validation path, CodeMind can use its existing `web_search` subsystem to research the official toolchain. Recognized research-only markers include Zig, Swift Package Manager, Dart/Flutter, Elixir Mix, CMake, and Makefiles.

Research remains advisory:

- it uses the existing read-only-network policy and `.codemind/config.json` web mode;
- queries, provider, status, and guidance are recorded in the mission event timeline;
- search snippets never become executable commands automatically;
- executable validation still requires a local manifest, accepted convention, or safe CI command.

Set `enablePortabilityWebResearch: false` when assembling the server runtime to disable automatic research. The normal CodeMind web configuration can also set `web.mode=off`, `ask`, or `strict`.

## Security properties

- host execution is never used as a fallback;
- Docker network is `none` for validation;
- capabilities are dropped and `no-new-privileges` is enabled;
- workspace roots and nested package roots are traversal-checked;
- command binaries and argument shapes are allowlisted;
- shell metacharacters are rejected;
- output is bounded and redacted;
- explicit validation configuration remains authoritative.

## Dependency boundary

Portable validation does not silently download dependencies during execution. Repositories must provide vendored/cached dependencies or an operator-approved preparation process. A missing tool or dependency produces real failure evidence for diagnosis; CodeMind does not report a false pass or enable validation-network access automatically.

## Evidence

The test suite includes:

- a mixed Node/Python/Go/Rust monorepo discovery fixture;
- nested package command-envelope and traversal tests;
- portable-runner routing tests;
- allowed and blocked policy-gated research tests;
- a live server mission that discovers and executes root and package-specific validation tasks.
