import {
  AGENT_KERNEL_BLOCK_ID,
  AGENT_KERNEL_MEMORY_SCOPES,
  AGENT_KERNEL_ROLES,
  AGENT_KERNEL_STEP_KINDS,
  type AgentKernelPlanningDecision,
  type AgentKernelWorkflowStep,
} from './agent-kernel.types.js';
import { AGENT_KERNEL_DEFAULT_SKILLS } from './agent-kernel-defaults.js';

export const AGENT_KERNEL_WORKFLOW_VALIDATOR_BLOCK_ID = 'AGENT-KERNEL-02' as const;
export const AGENT_KERNEL_WORKFLOW_VALIDATOR_PR_ID = 'PR-AK-02' as const;
export const AGENT_KERNEL_WORKFLOW_VALIDATOR_PHASE_ID = 'Phase-16G-AK-02' as const;

export const AGENT_KERNEL_WORKFLOW_FINDING_SEVERITIES = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;
export type AgentKernelWorkflowFindingSeverity =
  (typeof AGENT_KERNEL_WORKFLOW_FINDING_SEVERITIES)[number];

export const AGENT_KERNEL_WORKFLOW_FINDING_CODES = [
  'LINEAGE_MISMATCH',
  'EMPTY_WORKFLOW',
  'DUPLICATE_STEP_ID',
  'UNKNOWN_ROLE',
  'UNKNOWN_MEMORY_SCOPE',
  'UNKNOWN_STEP_KIND',
  'UNKNOWN_SKILL',
  'MUTATION_NOT_ALLOWED',
  'MISSING_OPERATOR_CHECKPOINT',
  'INVALID_OPERATOR_CHECKPOINT',
  'PATCH_PROPOSAL_REQUIRES_CHECKPOINT',
] as const;
export type AgentKernelWorkflowFindingCode =
  (typeof AGENT_KERNEL_WORKFLOW_FINDING_CODES)[number];

export interface AgentKernelWorkflowValidationFinding {
  readonly code: AgentKernelWorkflowFindingCode;
  readonly severity: AgentKernelWorkflowFindingSeverity;
  readonly message: string;
  readonly stepId?: string;
}

export interface AgentKernelWorkflowValidationReport {
  readonly valid: boolean;
  readonly validatorBlockId: typeof AGENT_KERNEL_WORKFLOW_VALIDATOR_BLOCK_ID;
  readonly validatorPrId: typeof AGENT_KERNEL_WORKFLOW_VALIDATOR_PR_ID;
  readonly validatorPhaseId: typeof AGENT_KERNEL_WORKFLOW_VALIDATOR_PHASE_ID;
  readonly sourceBlockId: string;
  readonly findings: readonly AgentKernelWorkflowValidationFinding[];
  readonly knownRoleCount: number;
  readonly knownSkillCount: number;
  readonly workflowStepCount: number;
  readonly operatorCheckpointCount: number;
  readonly mutationBlocked: boolean;
}

function makeFinding(
  code: AgentKernelWorkflowFindingCode,
  severity: AgentKernelWorkflowFindingSeverity,
  message: string,
  stepId?: string,
): AgentKernelWorkflowValidationFinding {
  if (stepId === undefined) {
    return { code, severity, message };
  }

  return { code, severity, message, stepId };
}

function hasDuplicateStepId(
  step: AgentKernelWorkflowStep,
  allSteps: readonly AgentKernelWorkflowStep[],
): boolean {
  return allSteps.filter((candidate) => candidate.stepId === step.stepId).length > 1;
}

export function validateAgentKernelWorkflow(
  decision: AgentKernelPlanningDecision,
): AgentKernelWorkflowValidationReport {
  const findings: AgentKernelWorkflowValidationFinding[] = [];
  const knownRoles: readonly string[] = AGENT_KERNEL_ROLES;
  const knownScopes: readonly string[] = AGENT_KERNEL_MEMORY_SCOPES;
  const knownStepKinds: readonly string[] = AGENT_KERNEL_STEP_KINDS;
  const knownSkillIds = AGENT_KERNEL_DEFAULT_SKILLS.map((skill) => skill.skillId);
  const workflowStepIds = new Set(decision.workflowSteps.map((step) => step.stepId));

  if (decision.blockId !== AGENT_KERNEL_BLOCK_ID) {
    findings.push(
      makeFinding(
        'LINEAGE_MISMATCH',
        'HIGH',
        `Expected workflow source block ${AGENT_KERNEL_BLOCK_ID}.`,
      ),
    );
  }

  if (decision.workflowSteps.length === 0) {
    findings.push(
      makeFinding('EMPTY_WORKFLOW', 'CRITICAL', 'Agent Kernel workflow must contain at least one step.'),
    );
  }

  for (const profile of decision.roleProfiles) {
    if (!knownRoles.includes(profile.role)) {
      findings.push(
        makeFinding('UNKNOWN_ROLE', 'HIGH', `Unknown role profile: ${profile.role}.`),
      );
    }

    if (!knownScopes.includes(profile.memoryScope)) {
      findings.push(
        makeFinding(
          'UNKNOWN_MEMORY_SCOPE',
          'HIGH',
          `Unknown memory scope for role ${profile.role}: ${profile.memoryScope}.`,
        ),
      );
    }
  }

  for (const skill of decision.selectedSkills) {
    if (!knownSkillIds.includes(skill.skillId)) {
      findings.push(
        makeFinding('UNKNOWN_SKILL', 'HIGH', `Unknown selected skill: ${skill.skillId}.`),
      );
    }
  }

  for (const step of decision.workflowSteps) {
    if (hasDuplicateStepId(step, decision.workflowSteps)) {
      findings.push(
        makeFinding('DUPLICATE_STEP_ID', 'HIGH', `Duplicate workflow step id: ${step.stepId}.`, step.stepId),
      );
    }

    if (!knownRoles.includes(step.role)) {
      findings.push(
        makeFinding('UNKNOWN_ROLE', 'HIGH', `Unknown workflow step role: ${step.role}.`, step.stepId),
      );
    }

    if (!knownStepKinds.includes(step.kind)) {
      findings.push(
        makeFinding('UNKNOWN_STEP_KIND', 'HIGH', `Unknown workflow step kind: ${step.kind}.`, step.stepId),
      );
    }

    if (typeof step.skillId === 'string' && !knownSkillIds.includes(step.skillId)) {
      findings.push(
        makeFinding('UNKNOWN_SKILL', 'HIGH', `Unknown workflow step skill: ${step.skillId}.`, step.stepId),
      );
    }

    if (step.allowedToMutate) {
      findings.push(
        makeFinding(
          'MUTATION_NOT_ALLOWED',
          'CRITICAL',
          'AGENT-KERNEL-02 requires workflow validation to remain planning-only.',
          step.stepId,
        ),
      );
    }

    if (step.kind === 'patch-proposal' && !step.approvalCheckpoint) {
      findings.push(
        makeFinding(
          'PATCH_PROPOSAL_REQUIRES_CHECKPOINT',
          'HIGH',
          'Patch proposal planning must include an operator checkpoint.',
          step.stepId,
        ),
      );
    }
  }

  if (decision.operatorCheckpoints.length === 0) {
    findings.push(
      makeFinding(
        'MISSING_OPERATOR_CHECKPOINT',
        'HIGH',
        'Agent Kernel workflow must expose at least one operator checkpoint.',
      ),
    );
  }

  for (const checkpointId of decision.operatorCheckpoints) {
    const matchingStep = decision.workflowSteps.find((step) => step.stepId === checkpointId);

    if (!workflowStepIds.has(checkpointId) || matchingStep?.approvalCheckpoint !== true) {
      findings.push(
        makeFinding(
          'INVALID_OPERATOR_CHECKPOINT',
          'HIGH',
          `Operator checkpoint does not reference an approval checkpoint step: ${checkpointId}.`,
          checkpointId,
        ),
      );
    }
  }

  const hasBlockingFinding = findings.some(
    (finding) => finding.severity === 'HIGH' || finding.severity === 'CRITICAL',
  );

  return {
    valid: !hasBlockingFinding,
    validatorBlockId: AGENT_KERNEL_WORKFLOW_VALIDATOR_BLOCK_ID,
    validatorPrId: AGENT_KERNEL_WORKFLOW_VALIDATOR_PR_ID,
    validatorPhaseId: AGENT_KERNEL_WORKFLOW_VALIDATOR_PHASE_ID,
    sourceBlockId: decision.blockId,
    findings,
    knownRoleCount: AGENT_KERNEL_ROLES.length,
    knownSkillCount: AGENT_KERNEL_DEFAULT_SKILLS.length,
    workflowStepCount: decision.workflowSteps.length,
    operatorCheckpointCount: decision.operatorCheckpoints.length,
    mutationBlocked: decision.workflowSteps.every((step) => !step.allowedToMutate),
  };
}
