import {
  AGENT_KERNEL_BLOCK_ID,
  AGENT_KERNEL_PHASE_ID,
  AGENT_KERNEL_PHASES,
  AGENT_KERNEL_PR_ID,
  type AgentKernelPlanningDecision,
  type AgentKernelPlanningRequest,
  type AgentKernelRole,
  type AgentKernelWorkflowStep,
} from './agent-kernel.types.js';
import {
  AGENT_KERNEL_DEFAULT_ROLE_PROFILES,
  AGENT_KERNEL_DEFAULT_SKILLS,
} from './agent-kernel-defaults.js';

const DEFAULT_AGENT_KERNEL_ROLES: readonly AgentKernelRole[] = ['orchestrator'];

function uniqueRoles(roles: readonly AgentKernelRole[]): readonly AgentKernelRole[] {
  const candidateRoles = roles.length > 0 ? roles : DEFAULT_AGENT_KERNEL_ROLES;
  return [...new Set(candidateRoles)];
}

function buildWorkflowSteps(
  request: AgentKernelPlanningRequest,
  roles: readonly AgentKernelRole[],
): readonly AgentKernelWorkflowStep[] {
  const steps: AgentKernelWorkflowStep[] = [
    {
      stepId: 'ak-01-governance-preflight',
      kind: 'plan-only',
      role: 'orchestrator',
      summary: 'Evaluate the request against CodeMind permission doctrine.',
      approvalCheckpoint: true,
      allowedToMutate: false,
    },
  ];

  if (roles.includes('researcher')) {
    steps.push({
      stepId: 'ak-01-read-context',
      kind: 'read-context',
      role: 'researcher',
      skillId: 'repo-inspection',
      summary: 'Gather read-only repository and project context.',
      approvalCheckpoint: false,
      allowedToMutate: false,
    });
  }

  if (request.allowPatchProposal || request.requestedMode === 'PATCH_PROPOSAL') {
    steps.push({
      stepId: 'ak-01-patch-proposal-plan',
      kind: 'patch-proposal',
      role: roles.includes('coder') ? 'coder' : 'orchestrator',
      skillId: 'patch-proposal-planning',
      summary: 'Prepare a PR-safe patch proposal plan for operator review.',
      approvalCheckpoint: true,
      allowedToMutate: false,
    });
  }

  if (roles.includes('validator') || request.requestedMode === 'CI_REVIEW') {
    steps.push({
      stepId: 'ak-01-validation-plan',
      kind: 'validation-plan',
      role: 'validator',
      skillId: 'workflow-validation-planning',
      summary: 'Plan typecheck, test, build, and CI evidence requirements.',
      approvalCheckpoint: true,
      allowedToMutate: false,
    });
  }

  if (roles.includes('memory-auditor')) {
    steps.push({
      stepId: 'ak-01-memory-lineage-audit',
      kind: 'plan-only',
      role: 'memory-auditor',
      skillId: 'memory-capsule-audit',
      summary: 'Audit imported planning assumptions for provenance and quarantine posture.',
      approvalCheckpoint: true,
      allowedToMutate: false,
    });
  }

  steps.push({
    stepId: 'ak-01-operator-checkpoint',
    kind: 'operator-checkpoint',
    role: 'orchestrator',
    summary: 'Return a deterministic planning report for operator review.',
    approvalCheckpoint: true,
    allowedToMutate: false,
  });

  return steps;
}

export function planAgentKernel01(
  request: AgentKernelPlanningRequest,
): AgentKernelPlanningDecision {
  const roles = uniqueRoles(request.requestedRoles);
  const roleProfiles = AGENT_KERNEL_DEFAULT_ROLE_PROFILES.filter((profile) =>
    roles.includes(profile.role),
  );

  const selectedSkills = AGENT_KERNEL_DEFAULT_SKILLS.filter(
    (skill) =>
      request.requestedSkills.length === 0 ||
      request.requestedSkills.includes(skill.skillId),
  );

  const blockedReasons: string[] = [];
  if (request.requestedMode === 'PATCH_PROPOSAL' && !request.allowPatchProposal) {
    blockedReasons.push(
      'PATCH_PROPOSAL mode requires allowPatchProposal=true because AGENT-KERNEL-01 is planning-only.',
    );
  }

  if (request.operatorIntent.trim().length === 0) {
    blockedReasons.push('Operator intent is required for deterministic kernel planning.');
  }

  const workflowSteps = buildWorkflowSteps(request, roles);

  return {
    requestId: request.requestId,
    accepted: blockedReasons.length === 0,
    blockId: AGENT_KERNEL_BLOCK_ID,
    prId: AGENT_KERNEL_PR_ID,
    phaseId: AGENT_KERNEL_PHASE_ID,
    phases: AGENT_KERNEL_PHASES,
    roleProfiles,
    selectedSkills,
    workflowSteps,
    operatorCheckpoints: workflowSteps
      .filter((step) => step.approvalCheckpoint)
      .map((step) => step.stepId),
    blockedReasons,
    doctrineNotes: [
      'AGENT-KERNEL-01 imports the X1YA0I-A-O-S planning substrate into CodeMind-native contracts.',
      'This block is planning-only and does not introduce external side effects.',
      'Patch work is represented as proposal planning until the governed execution spine is introduced.',
      'Role memory scopes remain isolated, shared-read-only, or export-only.',
    ],
    sourceLineage: [
      'X1YA0I-A-O-S AGENT-OS-14 multi-agent role layer',
      'X1YA0I-A-O-S governed skill registry doctrine',
      'X1YA0I-A-O-S workflow validation and memory capsule planning doctrine',
      'CodeMind Phase-16G-AK-01 runtime spine integration lineage',
    ],
  };
}
