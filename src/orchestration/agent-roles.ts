import type { TaskExecutionMode } from './collaborative-task-types.js'
import {
  BUILTIN_AGENT_ROLES,
  type AgentRole,
  type BuiltinAgentRole,
} from './orchestration-types.js'

/**
 * A role's declared responsibilities and boundaries (Sections 6-7). `defaultMutationAllowed`
 * governs the workspace mode `agent-workspace-service.ts` grants by default; it is never a
 * substitute for the member's own delegated-access grant, which is still checked on every write.
 */
export interface AgentRoleDefinition {
  readonly id: AgentRole
  readonly displayName: string
  readonly purpose: string
  readonly responsibilities: readonly string[]
  readonly defaultExecutionModes: readonly TaskExecutionMode[]
  readonly defaultMutationAllowed: boolean
  readonly reviewAuthority: boolean
  readonly custom: boolean
}

function role(
  id: BuiltinAgentRole,
  displayName: string,
  purpose: string,
  responsibilities: readonly string[],
  defaultExecutionModes: readonly TaskExecutionMode[],
  defaultMutationAllowed: boolean,
  reviewAuthority: boolean,
): AgentRoleDefinition {
  return {
    id,
    displayName,
    purpose,
    responsibilities,
    defaultExecutionModes,
    defaultMutationAllowed,
    reviewAuthority,
    custom: false,
  }
}

export const BUILTIN_ROLE_DEFINITIONS: Readonly<Record<BuiltinAgentRole, AgentRoleDefinition>> = {
  'lead-orchestrator': role(
    'lead-orchestrator',
    'Lead Orchestrator',
    'Understand the mission objective and coordinate the team without bypassing policy or expanding scope.',
    [
      'Request repository intelligence',
      'Construct or refine the collaborative task graph',
      'Select specialists and assign work',
      'Monitor dependencies and trigger reviews',
      'Handle blocked tasks and initiate integration',
      'Summarize decisions',
    ],
    ['analysis'],
    false,
    false,
  ),
  'repository-investigator': role(
    'repository-investigator',
    'Repository Investigator',
    'Produce an evidence-backed investigation report; read-only by default.',
    [
      'Inspect architecture and locate relevant files/entry points',
      'Gather dependency and call-path evidence',
      'Identify prior implementations and duplicated/orphaned systems',
    ],
    ['analysis'],
    false,
    false,
  ),
  'architecture-specialist': role(
    'architecture-specialist',
    'Architecture Specialist',
    'Evaluate system boundaries and propose implementation approaches.',
    [
      'Evaluate coupling and lifecycle concerns',
      'Propose implementation approaches',
      'Assess migration/compatibility risk',
      'Review architectural consistency',
    ],
    ['analysis', 'proposal', 'review'],
    false,
    true,
  ),
  'implementation-agent': role(
    'implementation-agent',
    'Implementation Agent',
    'Implement assigned task slices within scope and return structured change evidence.',
    [
      'Implement assigned task slices',
      'Remain within assigned file/subsystem scope',
      'Provide structured change evidence',
      'Run focused validation',
    ],
    ['isolated-mutation'],
    true,
    false,
  ),
  'test-engineer': role(
    'test-engineer',
    'Test Engineer',
    'Design regression and integration tests that exercise real, production-reachable paths.',
    [
      'Design regression/integration tests',
      'Inspect production reachability',
      'Reject tests that only validate mocks or utilities',
      'Identify missing adversarial coverage',
    ],
    ['isolated-mutation', 'review'],
    true,
    false,
  ),
  'security-reviewer': role(
    'security-reviewer',
    'Security Reviewer',
    'Analyze trust boundaries and review the final diff; read-only by default.',
    [
      'Analyze trust boundaries, authorization, and secret handling',
      'Test privilege-escalation and injection paths',
      'Identify unsafe assumptions',
      'Review the final diff',
    ],
    ['analysis', 'review'],
    false,
    true,
  ),
  'reliability-specialist': role(
    'reliability-specialist',
    'Reliability Specialist',
    'Inspect retries, timeouts, persistence, restart behavior, and idempotency.',
    [
      'Inspect retries/timeouts/cancellation/persistence/restart/idempotency',
      'Distinguish infrastructure failures from real regressions',
      'Validate failure-state preservation',
    ],
    ['analysis', 'review'],
    false,
    true,
  ),
  'performance-specialist': role(
    'performance-specialist',
    'Performance Specialist',
    'Detect hot paths and reject unmeasured optimization claims.',
    [
      'Detect hot paths',
      'Benchmark relevant code',
      'Evaluate memory/CPU/I-O/concurrency/latency',
      'Reject unmeasured optimization claims',
    ],
    ['analysis', 'review'],
    false,
    true,
  ),
  'adversarial-reviewer': role(
    'adversarial-reviewer',
    'Adversarial Reviewer',
    'Challenge implementation assumptions and attempt to falsify completion claims.',
    [
      'Challenge assumptions and search for bypasses',
      'Attempt to falsify completion claims',
      'Inspect missing production wiring',
      'Produce blocking and non-blocking findings',
    ],
    ['review'],
    false,
    true,
  ),
  'integration-agent': role(
    'integration-agent',
    'Integration Agent',
    'Combine approved outputs and maintain the canonical integration workspace.',
    [
      'Combine approved outputs in dependency order',
      'Detect conflicts',
      'Run integration checks',
      'Maintain the canonical integration workspace',
    ],
    ['integration'],
    true,
    false,
  ),
  'validation-agent': role(
    'validation-agent',
    'Validation Agent',
    'Execute the full validation matrix and route repair tasks; never edits production code outside a repair role.',
    [
      'Execute the complete validation matrix',
      'Classify failures',
      'Route repair tasks',
      'Generate final evidence',
    ],
    ['validation'],
    false,
    false,
  ),
} as const

export function isBuiltinAgentRole(value: string): value is BuiltinAgentRole {
  return (BUILTIN_AGENT_ROLES as readonly string[]).includes(value)
}

export interface CustomRoleDefinitionInput {
  readonly name: string
  readonly purpose: string
  readonly responsibilities: readonly string[]
  readonly defaultExecutionModes: readonly TaskExecutionMode[]
  readonly defaultMutationAllowed: boolean
  readonly reviewAuthority: boolean
}

const CUSTOM_ROLE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,63}$/

export class CustomRoleValidationError extends Error {}

/**
 * Operators may define custom roles (Section 7), but a custom role can never grant itself more
 * than the built-in shape allows: it still only *declares* purpose/scope/modes here, and every
 * capability it can actually exercise still comes from the member's own delegated-access grant
 * (`src/access/`) — a custom role definition cannot itself widen authorization or bypass
 * protected-path policy, since neither is represented in this type at all.
 */
export function defineCustomAgentRole(input: CustomRoleDefinitionInput): AgentRoleDefinition {
  if (!CUSTOM_ROLE_NAME_PATTERN.test(input.name)) {
    throw new CustomRoleValidationError(
      `Custom role name "${input.name}" must be lowercase kebab-case, 2-64 chars.`,
    )
  }
  if (input.purpose.trim().length === 0) {
    throw new CustomRoleValidationError('Custom role requires a non-empty purpose.')
  }
  return {
    id: `custom:${input.name}`,
    displayName: input.name,
    purpose: input.purpose,
    responsibilities: input.responsibilities,
    defaultExecutionModes: input.defaultExecutionModes,
    defaultMutationAllowed: input.defaultMutationAllowed,
    reviewAuthority: input.reviewAuthority,
    custom: true,
  }
}

export function resolveRoleDefinition(
  role: AgentRole,
  customRoles: readonly AgentRoleDefinition[] = [],
): AgentRoleDefinition | undefined {
  if (isBuiltinAgentRole(role)) return BUILTIN_ROLE_DEFINITIONS[role]
  return customRoles.find((def) => def.id === role)
}
