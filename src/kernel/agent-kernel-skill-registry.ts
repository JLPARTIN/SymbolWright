import {
  AGENT_KERNEL_DEFAULT_SKILLS,
} from './agent-kernel-defaults.js';
import type {
  AgentKernelSkillDeclaration,
  AgentKernelSkillRiskClass,
} from './agent-kernel.types.js';

export const AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID = 'AGENT-KERNEL-03' as const;
export const AGENT_KERNEL_SKILL_REGISTRY_PR_ID = 'PR-AK-03' as const;
export const AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID = 'Phase-16G-AK-03' as const;

export const AGENT_KERNEL_SKILL_PROPOSAL_STATUSES = [
  'PROPOSED',
  'QUARANTINED',
  'APPROVED_FOR_REGISTRY',
  'REJECTED',
] as const;
export type AgentKernelSkillProposalStatus =
  (typeof AGENT_KERNEL_SKILL_PROPOSAL_STATUSES)[number];

export interface AgentKernelSkillLookupResult {
  readonly found: boolean;
  readonly skillId: string;
  readonly skill?: AgentKernelSkillDeclaration;
}

export interface AgentKernelSkillRegistrySnapshot {
  readonly blockId: typeof AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID;
  readonly prId: typeof AGENT_KERNEL_SKILL_REGISTRY_PR_ID;
  readonly phaseId: typeof AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID;
  readonly skills: readonly AgentKernelSkillDeclaration[];
  readonly skillIds: readonly string[];
  readonly registrySize: number;
}

export interface AgentKernelSkillProposal {
  readonly proposalId: string;
  readonly proposedSkill: AgentKernelSkillDeclaration;
  readonly proposedBy: string;
  readonly rationale: string;
  readonly status: AgentKernelSkillProposalStatus;
  readonly operatorApprovalRequired: boolean;
  readonly quarantineReasons: readonly string[];
}

export interface AgentKernelSkillProposalReview {
  readonly proposalId: string;
  readonly acceptedForReview: boolean;
  readonly status: AgentKernelSkillProposalStatus;
  readonly reasons: readonly string[];
  readonly proposedSkillId: string;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeSkill(skill: AgentKernelSkillDeclaration): AgentKernelSkillDeclaration {
  return {
    ...skill,
    allowedToolCategories: uniqueStrings(skill.allowedToolCategories),
    blockedToolCategories: uniqueStrings(skill.blockedToolCategories),
    outputTypes: uniqueStrings(skill.outputTypes),
    tags: uniqueStrings(skill.tags),
  };
}

export function getAgentKernelSkillRegistrySnapshot(
  skills: readonly AgentKernelSkillDeclaration[] = AGENT_KERNEL_DEFAULT_SKILLS,
): AgentKernelSkillRegistrySnapshot {
  const normalizedSkills = skills.map((skill) => normalizeSkill(skill));

  return {
    blockId: AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID,
    prId: AGENT_KERNEL_SKILL_REGISTRY_PR_ID,
    phaseId: AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID,
    skills: normalizedSkills,
    skillIds: normalizedSkills.map((skill) => skill.skillId),
    registrySize: normalizedSkills.length,
  };
}

export function lookupAgentKernelSkill(
  skillId: string,
  skills: readonly AgentKernelSkillDeclaration[] = AGENT_KERNEL_DEFAULT_SKILLS,
): AgentKernelSkillLookupResult {
  const normalizedSkillId = skillId.trim();
  const skill = skills.find((candidate) => candidate.skillId === normalizedSkillId);

  if (!skill) {
    return {
      found: false,
      skillId: normalizedSkillId,
    };
  }

  return {
    found: true,
    skillId: normalizedSkillId,
    skill: normalizeSkill(skill),
  };
}

export function createAgentKernelSkillProposal(
  input: {
    readonly proposalId: string;
    readonly proposedSkill: AgentKernelSkillDeclaration;
    readonly proposedBy: string;
    readonly rationale: string;
  },
): AgentKernelSkillProposal {
  const quarantineReasons: string[] = [];
  const skill = normalizeSkill(input.proposedSkill);

  if (skill.skillId.trim().length === 0) {
    quarantineReasons.push('Skill id is required.');
  }

  if (skill.displayName.trim().length === 0) {
    quarantineReasons.push('Skill display name is required.');
  }

  if (skill.allowedToolCategories.length === 0) {
    quarantineReasons.push('At least one allowed tool category must be declared.');
  }

  if (skill.outputTypes.length === 0) {
    quarantineReasons.push('At least one output type must be declared.');
  }

  if (skill.riskClass === 'HIGH' || skill.riskClass === 'CRITICAL') {
    quarantineReasons.push('High-risk and critical skills require operator review before registry promotion.');
  }

  return {
    proposalId: input.proposalId,
    proposedSkill: skill,
    proposedBy: input.proposedBy,
    rationale: input.rationale,
    status: quarantineReasons.length === 0 ? 'PROPOSED' : 'QUARANTINED',
    operatorApprovalRequired: true,
    quarantineReasons,
  };
}

export function reviewAgentKernelSkillProposal(
  proposal: AgentKernelSkillProposal,
): AgentKernelSkillProposalReview {
  if (proposal.status === 'QUARANTINED') {
    return {
      proposalId: proposal.proposalId,
      acceptedForReview: false,
      status: 'QUARANTINED',
      reasons: proposal.quarantineReasons,
      proposedSkillId: proposal.proposedSkill.skillId,
    };
  }

  return {
    proposalId: proposal.proposalId,
    acceptedForReview: true,
    status: 'PROPOSED',
    reasons: [
      'Skill proposal is reviewable, but it is not active until a registry PR is approved and merged.',
    ],
    proposedSkillId: proposal.proposedSkill.skillId,
  };
}

export function rankAgentKernelSkillRisk(risk: AgentKernelSkillRiskClass): number {
  switch (risk) {
    case 'LOW':
      return 1;
    case 'MEDIUM':
      return 2;
    case 'HIGH':
      return 3;
    case 'CRITICAL':
      return 4;
  }
}
