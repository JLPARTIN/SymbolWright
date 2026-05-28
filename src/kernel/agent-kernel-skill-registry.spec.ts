import { describe, expect, it } from 'vitest';

import type { AgentKernelSkillDeclaration } from './agent-kernel.types.js';
import {
  createAgentKernelSkillProposal,
  getAgentKernelSkillRegistrySnapshot,
  lookupAgentKernelSkill,
  reviewAgentKernelSkillProposal,
} from './agent-kernel-skill-registry.js';
import { validateAgentKernelSkillUse } from './agent-kernel-skill-validator.js';

const customSkill: AgentKernelSkillDeclaration = {
  skillId: 'custom-safe-reader',
  displayName: 'Custom Safe Reader',
  allowedToolCategories: ['FILE_READER'],
  blockedToolCategories: ['PATCH_APPLIER'],
  outputTypes: ['custom-summary'],
  riskClass: 'LOW',
  approvalRequired: false,
  tags: ['custom', 'safe'],
};

describe('AGENT-KERNEL-03 skill registry', () => {
  it('exposes canonical AGENT-KERNEL-03 lineage', () => {
    const snapshot = getAgentKernelSkillRegistrySnapshot();

    expect(snapshot.blockId).toBe('AGENT-KERNEL-03');
    expect(snapshot.prId).toBe('PR-AK-03');
    expect(snapshot.phaseId).toBe('Phase-16G-AK-03');
    expect(snapshot.registrySize).toBeGreaterThan(0);
  });

  it('looks up registered skills deterministically', () => {
    const lookup = lookupAgentKernelSkill('custom-safe-reader', [customSkill]);

    expect(lookup.found).toBe(true);
    expect(lookup.skill?.skillId).toBe('custom-safe-reader');
  });

  it('returns not found for unknown skills without activating them', () => {
    const lookup = lookupAgentKernelSkill('not-registered', [customSkill]);

    expect(lookup.found).toBe(false);
    expect(lookup.skill).toBeUndefined();
  });

  it('allows new skill proposals into review without active registry use', () => {
    const proposal = createAgentKernelSkillProposal({
      proposalId: 'proposal-1',
      proposedBy: 'operator',
      rationale: 'Add a safe reader skill for a future registry PR.',
      proposedSkill: customSkill,
    });
    const review = reviewAgentKernelSkillProposal(proposal);

    expect(proposal.status).toBe('PROPOSED');
    expect(proposal.operatorApprovalRequired).toBe(true);
    expect(review.acceptedForReview).toBe(true);
    expect(review.reasons[0]).toContain('not active until a registry PR is approved and merged');
  });

  it('quarantines incomplete or high-risk skill proposals', () => {
    const proposal = createAgentKernelSkillProposal({
      proposalId: 'proposal-2',
      proposedBy: 'operator',
      rationale: 'Unsafe draft.',
      proposedSkill: {
        ...customSkill,
        skillId: '',
        allowedToolCategories: [],
        riskClass: 'CRITICAL',
      },
    });
    const review = reviewAgentKernelSkillProposal(proposal);

    expect(proposal.status).toBe('QUARANTINED');
    expect(review.acceptedForReview).toBe(false);
    expect(review.reasons.length).toBeGreaterThan(0);
  });
});

describe('AGENT-KERNEL-03 skill validator', () => {
  it('rejects unknown skills in active skill-use requests', () => {
    const report = validateAgentKernelSkillUse(
      {
        requestId: 'skill-use-1',
        skillId: 'unknown-skill',
        requestedToolCategory: 'FILE_READER',
        requestedOutputType: 'custom-summary',
        operatorApproved: true,
        maxAllowedRisk: 'LOW',
      },
      [customSkill],
    );

    expect(report.valid).toBe(false);
    expect(report.unknownSkillRejected).toBe(true);
    expect(report.findings[0]?.code).toBe('UNKNOWN_SKILL');
  });

  it('allows registered low-risk skill use when all declarations match', () => {
    const report = validateAgentKernelSkillUse(
      {
        requestId: 'skill-use-2',
        skillId: 'custom-safe-reader',
        requestedToolCategory: 'FILE_READER',
        requestedOutputType: 'custom-summary',
        operatorApproved: false,
        maxAllowedRisk: 'LOW',
      },
      [customSkill],
    );

    expect(report.valid).toBe(true);
    expect(report.findings[0]?.code).toBe('VALID_SKILL_USE');
  });

  it('rejects blocked or undeclared tool categories', () => {
    const report = validateAgentKernelSkillUse(
      {
        requestId: 'skill-use-3',
        skillId: 'custom-safe-reader',
        requestedToolCategory: 'PATCH_APPLIER',
        requestedOutputType: 'custom-summary',
        operatorApproved: true,
        maxAllowedRisk: 'LOW',
      },
      [customSkill],
    );

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain('TOOL_CATEGORY_BLOCKED');
    expect(report.findings.map((finding) => finding.code)).toContain('TOOL_CATEGORY_NOT_ALLOWED');
  });

  it('requires declared output types', () => {
    const report = validateAgentKernelSkillUse(
      {
        requestId: 'skill-use-4',
        skillId: 'custom-safe-reader',
        requestedToolCategory: 'FILE_READER',
        requestedOutputType: 'unknown-output',
        operatorApproved: true,
        maxAllowedRisk: 'LOW',
      },
      [customSkill],
    );

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain('OUTPUT_TYPE_NOT_DECLARED');
  });

  it('enforces risk ceilings and approval requirements', () => {
    const riskySkill: AgentKernelSkillDeclaration = {
      ...customSkill,
      skillId: 'risky-skill',
      riskClass: 'HIGH',
      approvalRequired: true,
    };

    const report = validateAgentKernelSkillUse(
      {
        requestId: 'skill-use-5',
        skillId: 'risky-skill',
        requestedToolCategory: 'FILE_READER',
        requestedOutputType: 'custom-summary',
        operatorApproved: false,
        maxAllowedRisk: 'MEDIUM',
      },
      [riskySkill],
    );

    expect(report.valid).toBe(false);
    expect(report.operatorApprovalRequired).toBe(true);
    expect(report.findings.map((finding) => finding.code)).toContain('RISK_EXCEEDS_LIMIT');
    expect(report.findings.map((finding) => finding.code)).toContain('APPROVAL_REQUIRED');
  });
});
