# Security Policy

SymbolWright is a coding-agent platform that can read, mutate, and push to real repositories.
Security issues in it can have real consequences, so we want to hear about them fast and handle
them privately until a fix is available.

## Project status

SymbolWright is currently published as an **open-source technical preview**, intended primarily for
self-hosted, single-operator, BYOK (bring-your-own-key) use. It is not yet operating as an
unrestricted multi-tenant hosted service. Keep that context in mind when assessing severity: issues
that only matter in a multi-tenant hosting scenario are still worth reporting, but are triaged
against that roadmap rather than an assumption that untrusted strangers already share one deployment
today.

## Supported versions

This project does not yet maintain multiple long-term-supported release lines. Security fixes are
made against the latest `main` and the latest published npm release. If you are running an older
tag, please upgrade before reporting — we may ask you to reproduce on latest first.

| Version         | Supported          |
| ---------------- | ------------------ |
| Latest `main` / latest npm release | :white_check_mark: |
| Older releases    | :x:                 |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting instead:

1. Go to this repository's Security tab and click **"Report a vulnerability"**
   (or use the direct link:
   https://github.com/JLPARTIN/SymbolWright/security/advisories/new).
2. Include as much detail as you can: affected version/commit, a minimal reproduction, the impact
   you believe it has, and any suggested fix.

This opens a private advisory visible only to maintainers and you, so the issue can be discussed and
fixed before any public disclosure.

If GitHub private reporting is ever unavailable to you, open a regular issue asking only for an
alternate private contact channel — do not include vulnerability details in that issue.

### What to expect

- We aim to acknowledge new reports within a few business days.
- We'll work with you to understand impact and reproduce the issue.
- Once a fix is ready, we'll coordinate on disclosure timing with you before publishing details
  publicly (advisory + patched release).
- Credit is given in the advisory unless you'd prefer to stay anonymous.

## Scope

In scope:

- The `symbolwright` npm package and CLI (`src/`, published `dist/`).
- The delegated-agent-access and authorization subsystem (`src/access/`) — see
  [`docs/security/DELEGATED_AGENT_ACCESS.md`](docs/security/DELEGATED_AGENT_ACCESS.md) for the
  trust model this is evaluated against.
- The bundled HTTP server (`symbolwright serve`) and its API surface.
- The Docker image and release/publish workflows in this repository.

Out of scope (report these upstream instead):

- Vulnerabilities in third-party dependencies with no SymbolWright-specific exploitation path —
  please report those to the dependency's own maintainers, though we're happy to hear about ones
  that materially affect us.
- Social engineering, physical security, or denial-of-service against infrastructure you do not
  control (e.g. someone else's self-hosted deployment).
- Findings that require an attacker to already hold the operator's `SYMBOLWRIGHT_API_KEY`, a
  provider API key, or a GitHub token with equivalent access — those are trusted credentials by
  design, not a privilege boundary. A way to *escalate past* a delegated-agent grant's declared
  scope using only that grant's own credential *is* in scope.

## Known limitations (not vulnerabilities, but worth knowing)

There are known, tracked gaps between "self-hosted single-operator use" and "unrestricted
multi-tenant hosted service" — token/session/cost governance, distributed rate limiting, tenant
isolation, and similar hosted-service concerns. These are tracked as roadmap work, not undisclosed
vulnerabilities, but if you believe one of them is exploitable in a way worse than documented,
please still report it.
