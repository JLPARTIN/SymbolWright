import type {
  AgentKernelSkillDeclaration,
  AgentKernelSkillRiskClass,
} from './agent-kernel.types.js';
import { AGENT_KERNEL_DEFAULT_SKILLS } from './agent-kernel-defaults.js';
import {
  AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID,
  AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID,
  AGENT_KERNEL_SKILL_REGISTRY_PR_ID,
  lookupAgentKernelSkill,
  rankAgentKernelSkillRisk,
} from './agent-kernel-skill-registry.js';

export const AGENT_KERNEL_SKILL_VALIDATION_FINDING_CODES = [
  'UNKNOWN_SKILL',
  'TOOL_CATEGORY_NOT_ALLOWED',
  'TOOL_CATEGORY_BLOCKED',
  'OUTPUT_TYPE_NOT_DECLARED',
  'APPROVAL_REQUIRED',
  'RISK_EXCEEDS_LIMIT',
  'VALID_SKILL_USE',
] as const;
export type AgentKernelSkillValidationFindingCode =
  (typeof AGENT_KERNEL_SKILL_VALIDATION_FINDING_CODES)[number];

export const AGENT_KERNEL_SKILL_VALIDATION_SEVERITIES = [
  'INFO',
  'ASK',
  'DENY',
] as const;
export type AgentKernelSkillValidationSeverity =
  (typeof AGENT_KERNEL_SKILL_VALIDATION_SEVERITIES)[number];

export interface AgentKernelSkillUseRequest {
  readonly requestId: string;
  readonly skillId: string;
  readonly requestedToolCategory: string;
  readonly requestedOutputType: string;
  readonly operatorApproved: boolean;
  readonly maxAllowedRisk: AgentKernelSkillRiskClass;
}

export interface AgentKernelSkillValidationFinding {
  readonly code: AgentKernelSkillValidationFindingCode;
  readonly severity: AgentKernelSkillValidationSeverity;
  readonly message: string;
}

export interface AgentKernelSkillValidationReport {
  readonly valid: boolean;
  readonly requestId: string;
  readonly skillId: string;
  readonly registryBlockId: typeof AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID;
  readonly registryPrId: typeof AGENT_KERNEL_SKILL_REGISTRY_PR_ID;
  readonly registryPhaseId: typeof AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID;
  readonly skill?: AgentKernelSkillDeclaration;
  readonly findings: readonly AgentKernelSkillValidationFinding[];
  readonly unknownSkillRejected: boolean;
  readonly operatorApprovalRequired: boolean;
}

function makeFinding(
  code: AgentKernelSkillValidationFindingCode,
  severity: AgentKernelSkillValidationSeverity,
  message: string,
): AgentKernelSkillValidationFinding {
  return { code, severity, message };
}

function hasDenyFinding(findings: readonly AgentKernelSkillValidationFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'DENY');
}

export function validateAgentKernelSkillUse(
  request: AgentKernelSkillUseRequest,
  skills: readonly AgentKernelSkillDeclaration[] = AGENT_KERNEL_DEFAULT_SKILLS,
): AgentKernelSkillValidationReport {
  const lookup = lookupAgentKernelSkill(request.skillId, skills);
  const findings: AgentKernelSkillValidationFinding[] = [];

  if (!lookup.found || !lookup.skill) {
    findings.push(
      makeFinding(
        'UNKNOWN_SKILL',
        'DENY',
        `Skill "${request.skillId}" is not registered in the Agent Kernel Skill Registry.`,
      ),
    );

    return {
      valid: false,
      requestId: request.requestId,
      skillId: request.skillId,
      registryBlockId: AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID,
      registryPrId: AGENT_KERNEL_SKILL_REGISTRY_PR_ID,
      registryPhaseId: AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID,
      findings,
      unknownSkillRejected: true,
      operatorApprovalRequired: false,
    };
  }

  const skill = lookup.skill;

  if (!skill.allowedToolCategories.includes(request.requestedToolCategory)) {
    findings.push(
      makeFinding(
        'TOOL_CATEGORY_NOT_ALLOWED',
        'DENY',
        `Tool category "${request.requestedToolCategory}" is not allowed for skill "${skill.skillId}".`,
      ),
    );
  }

  if (skill.blockedToolCategories.includes(request.requestedToolCategory)) {
    findings.push(
      makeFinding(
        'TOOL_CATEGORY_BLOCKED',
        'DENY',
        `Tool category "${request.requestedToolCategory}" is blocked for skill "${skill.skillId}".`,
      ),
    );
  }

  if (!skill.outputTypes.includes(request.requestedOutputType)) {
    findings.push(
      makeFinding(
        'OUTPUT_TYPE_NOT_DECLARED',
        'DENY',
        `Output type "${request.requestedOutputType}" is not declared for skill "${skill.skillId}".`,
      ),
    );
  }

  if (rankAgentKernelSkillRisk(skill.riskClass) > rankAgentKernelSkillRisk(request.maxAllowedRisk)) {
    findings.push(
      makeFinding(
        'RISK_EXCEEDS_LIMIT',
        'DENY',
        `Skill risk ${skill.riskClass} exceeds maximum allowed risk ${request.maxAllowedRisk}.`,
      ),
    );
  }

  if (skill.approvalRequired && !request.operatorApproved) {
    findings.push(
      makeFinding(
        'APPROVAL_REQUIRED',
        'ASK',
        `Skill "${skill.skillId}" requires operator approval before active use.`,
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      makeFinding('VALID_SKILL_USE', 'INFO', `Skill "${skill.skillId}" passed active-use validation.`),
    );
  }

  return {
    valid: !hasDenyFinding(findings) && !findings.some((finding) => finding.severity === 'ASK'),
    requestId: request.requestId,
    skillId: skill.skillId,
    registryBlockId: AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID,
    registryPrId: AGENT_KERNEL_SKILL_REGISTRY_PR_ID,
    registryPhaseId: AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID,
    skill,
    findings,
    unknownSkillRejected: false,
    operatorApprovalRequired: findings.some((finding) => finding.code === 'APPROVAL_REQUIRED'),
  };
}
