import type {
  AgentKernelRoleProfile,
  AgentKernelSkillDeclaration,
} from './agent-kernel.types.js';

export const AGENT_KERNEL_DEFAULT_ROLE_PROFILES: readonly AgentKernelRoleProfile[] = [
  {
    role: 'orchestrator',
    memoryScope: 'shared-read-only',
    responsibilities: [
      'Coordinate bounded planning across roles.',
      'Preserve operator checkpoints before any mutation-capable phase.',
      'Keep AGENT-KERNEL-01 output deterministic and reviewable.',
    ],
    blockedActions: [
      'spawn live sub-agents',
      'call providers directly',
      'execute shell commands',
      'mutate repositories without an approved execution spine',
    ],
  },
  {
    role: 'researcher',
    memoryScope: 'shared-read-only',
    responsibilities: [
      'Gather read-only repository and project context.',
      'Separate evidence from hypothesis.',
      'Prepare context packets for downstream planning.',
    ],
    blockedActions: ['write files', 'post comments', 'open pull requests'],
  },
  {
    role: 'coder',
    memoryScope: 'isolated',
    responsibilities: [
      'Translate plans into patch proposals only.',
      'Minimize proposed changes.',
      'Identify files likely affected by the requested work.',
    ],
    blockedActions: ['apply patches', 'run formatters', 'commit changes'],
  },
  {
    role: 'validator',
    memoryScope: 'shared-read-only',
    responsibilities: [
      'Plan typecheck, test, build, and CI validation steps.',
      'Flag missing evidence before merge-readiness claims.',
      'Keep validation recommendations non-mutating.',
    ],
    blockedActions: ['run commands without approval', 'mark merge-ready without evidence'],
  },
  {
    role: 'scheduler',
    memoryScope: 'export-only',
    responsibilities: [
      'Sequence work into PR-safe slices.',
      'Identify dependency order and rollback posture.',
      'Preserve milestone naming lineage.',
    ],
    blockedActions: ['auto-schedule external work', 'create background jobs'],
  },
  {
    role: 'memory-auditor',
    memoryScope: 'export-only',
    responsibilities: [
      'Track source lineage and provenance for imported planning substrate records.',
      'Quarantine uncertain or contradictory planning assumptions.',
      'Prevent automatic promotion into durable memory.',
    ],
    blockedActions: ['write memory automatically', 'erase memory records silently'],
  },
];

export const AGENT_KERNEL_DEFAULT_SKILLS: readonly AgentKernelSkillDeclaration[] = [
  {
    skillId: 'repo-inspection',
    displayName: 'Read-Only Repository Inspection',
    allowedToolCategories: ['REPO_METADATA_READER', 'FILE_READER', 'SEARCH_READER'],
    blockedToolCategories: ['PATCH_APPLIER', 'COMMAND_RUNNER', 'GIT_MUTATOR'],
    outputTypes: ['repo-context-summary', 'risk-notes'],
    riskClass: 'LOW',
    approvalRequired: false,
    tags: ['aos-migration', 'read-only', 'context'],
  },
  {
    skillId: 'patch-proposal-planning',
    displayName: 'Patch Proposal Planning',
    allowedToolCategories: ['PLANNER', 'CONTEXT_ASSEMBLER', 'PATCH_PROPOSER'],
    blockedToolCategories: ['PATCH_APPLIER', 'COMMAND_RUNNER', 'GITHUB_MUTATOR'],
    outputTypes: ['patch-plan', 'operator-checkpoint'],
    riskClass: 'MEDIUM',
    approvalRequired: true,
    tags: ['execution-spine-ready', 'non-mutating'],
  },
  {
    skillId: 'workflow-validation-planning',
    displayName: 'Workflow Validation Planning',
    allowedToolCategories: ['PLANNER', 'PROJECT_DOC_READER', 'CONTEXT_ASSEMBLER'],
    blockedToolCategories: ['COMMAND_RUNNER', 'GIT_MUTATOR', 'GITHUB_MUTATOR'],
    outputTypes: ['validation-plan', 'approval-checkpoints'],
    riskClass: 'MEDIUM',
    approvalRequired: true,
    tags: ['workflow', 'validation', 'planning-only'],
  },
  {
    skillId: 'memory-capsule-audit',
    displayName: 'Memory Capsule Audit Planning',
    allowedToolCategories: ['PLANNER', 'PROJECT_DOC_READER'],
    blockedToolCategories: ['PROJECT_DOC_WRITER', 'AUDIT_WRITER', 'GITHUB_MUTATOR'],
    outputTypes: ['memory-lineage', 'quarantine-notes'],
    riskClass: 'HIGH',
    approvalRequired: true,
    tags: ['memory', 'provenance', 'quarantine'],
  },
];
