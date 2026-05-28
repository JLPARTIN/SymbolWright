import { describe, expect, it } from 'vitest';

import { planAgentKernel01 } from './agent-kernel-planner.js';
import type { AgentKernelPlanningRequest } from './agent-kernel.types.js';
import { validateAgentKernelWorkflow } from './agent-kernel-workflow-validator.js';
import { validateAgentKernelSkillUse } from './agent-kernel-skill-validator.js';
import { buildAgentKernelContextPacket } from './agent-kernel-context-packet.js';

function makeRequest(
  overrides: Partial<AgentKernelPlanningRequest> = {},
): AgentKernelPlanningRequest {
  return {
    requestId: 'ak-04-req-1',
    sessionId: 'session-1',
    operatorIntent: 'Build a provider-ready context packet without invoking a provider.',
    targetRepository: 'JLPARTIN/JLPARTIN-CodeMind',
    targetRef: 'main',
    requestedMode: 'PLAN',
    requestedRoles: ['orchestrator', 'researcher', 'coder', 'validator'],
    requestedSkills: ['repo-inspection'],
    allowPatchProposal: false,
    ...overrides,
  };
}

describe('AGENT-KERNEL-04 context packet builder', () => {
  it('builds a provider-ready packet from accepted planning and valid validations', () => {
    const planning = planAgentKernel01(makeRequest());
    const workflowValidation = validateAgentKernelWorkflow(planning);
    const skillValidation = validateAgentKernelSkillUse({
      requestId: 'skill-use-1',
      skillId: 'repo-inspection',
      requestedToolCategory: 'FILE_READER',
      requestedOutputType: 'repo-context-summary',
      operatorApproved: true,
      maxAllowedRisk: 'LOW',
    });

    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-1',
      planningDecision: planning,
      workflowValidation,
      skillValidations: [skillValidation],
      repoContext: {
        repository: 'JLPARTIN/JLPARTIN-CodeMind',
        ref: 'main',
        summary: 'CodeMind Agent Kernel repository.',
      },
      maxSections: 8,
      maxSourceLineageItems: 3,
    });

    expect(packet.blockId).toBe('AGENT-KERNEL-04');
    expect(packet.prId).toBe('PR-AK-04');
    expect(packet.phaseId).toBe('Phase-16G-AK-04');
    expect(packet.providerReady).toBe(true);
    expect(packet.providerInvoked).toBe(false);
    expect(packet.warnings).toEqual([]);
    expect(packet.items.map((item) => item.section)).toContain('operator-intent');
    expect(packet.items.map((item) => item.section)).toContain('repo-reference');
    expect(packet.items.map((item) => item.section)).toContain('skill-validation');
  });

  it('marks packets as not provider-ready when planning is rejected', () => {
    const planning = planAgentKernel01(makeRequest({ operatorIntent: '   ' }));
    const workflowValidation = validateAgentKernelWorkflow(planning);

    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-2',
      planningDecision: planning,
      workflowValidation,
      skillValidations: [],
      maxSections: 8,
      maxSourceLineageItems: 3,
    });

    expect(packet.providerReady).toBe(false);
    expect(packet.providerInvoked).toBe(false);
    expect(packet.warnings).toContain(
      'Planning decision is not accepted; packet is context-only.',
    );
  });

  it('marks packets as not provider-ready when workflow validation is invalid', () => {
    const planning = planAgentKernel01(makeRequest());
    const invalidWorkflow = validateAgentKernelWorkflow({
      ...planning,
      workflowSteps: [],
      operatorCheckpoints: [],
    });

    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-3',
      planningDecision: planning,
      workflowValidation: invalidWorkflow,
      skillValidations: [],
      maxSections: 8,
      maxSourceLineageItems: 3,
    });

    expect(packet.providerReady).toBe(false);
    expect(packet.warnings).toContain(
      'Workflow validation is not valid; packet is context-only.',
    );
  });

  it('marks packets as not provider-ready when skill validation fails', () => {
    const planning = planAgentKernel01(makeRequest());
    const workflowValidation = validateAgentKernelWorkflow(planning);
    const invalidSkillValidation = validateAgentKernelSkillUse({
      requestId: 'skill-use-2',
      skillId: 'unknown-skill',
      requestedToolCategory: 'FILE_READER',
      requestedOutputType: 'repo-context-summary',
      operatorApproved: true,
      maxAllowedRisk: 'LOW',
    });

    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-4',
      planningDecision: planning,
      workflowValidation,
      skillValidations: [invalidSkillValidation],
      maxSections: 8,
      maxSourceLineageItems: 3,
    });

    expect(packet.providerReady).toBe(false);
    expect(packet.warnings).toContain(
      'One or more skill validations are not valid; packet is context-only.',
    );
  });

  it('applies section boundaries and reports omitted sections deterministically', () => {
    const planning = planAgentKernel01(makeRequest());
    const workflowValidation = validateAgentKernelWorkflow(planning);

    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-5',
      planningDecision: planning,
      workflowValidation,
      skillValidations: [],
      repoContext: {
        repository: 'JLPARTIN/JLPARTIN-CodeMind',
        ref: 'main',
      },
      maxSections: 3,
      maxSourceLineageItems: 1,
    });

    expect(packet.items).toHaveLength(3);
    expect(packet.boundary.truncated).toBe(true);
    expect(packet.boundary.omittedSections.length).toBeGreaterThan(0);
    expect(packet.boundary.maxSourceLineageItems).toBe(1);
  });

  it('normalizes invalid low section limits to at least one emitted section', () => {
    const planning = planAgentKernel01(makeRequest());
    const workflowValidation = validateAgentKernelWorkflow(planning);

    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-6',
      planningDecision: planning,
      workflowValidation,
      skillValidations: [],
      maxSections: 0,
      maxSourceLineageItems: -1,
    });

    expect(packet.boundary.maxSections).toBe(1);
    expect(packet.items).toHaveLength(1);
    expect(packet.boundary.maxSourceLineageItems).toBe(0);
  });
});
