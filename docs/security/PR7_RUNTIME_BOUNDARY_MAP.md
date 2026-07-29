# PR 7 Runtime Boundary Map

Temporary audit artifact; remove before final review.

- Structured execution authority: `SandboxExecutionBroker.authorize` and `authorizeCommand`.
- Strong container backend: `sandbox-container-command-plan.ts`, `sandbox-container-backend.ts`, and copy-in/copy-out workspace helpers.
- Governed dependency components: `dependency-policy.ts`, `dependency-https-fetcher.ts`, `dependency-artifact-cache.ts`, `dependency-acquisition-service.ts`, npm planning/archive inspection/layer materialization.
- Brokered egress components: `egress-policy.ts`, `egress-broker.ts`, `egress-operator-state.ts`.
- Public/agent entrypoints: sandbox HTTP routes, runtime sandbox tools, validation adapters, autonomy runtime, team/subagent dispatch.
- Operator truth surfaces: doctor, readiness, web status, configuration examples, and runtime documentation.
