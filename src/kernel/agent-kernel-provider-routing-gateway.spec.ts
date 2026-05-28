import { describe, expect, it } from 'vitest';

import { planAgentKernel01 } from './agent-kernel-planner.js';
import type { AgentKernelPlanningRequest } from './agent-kernel.types.js';
import { validateAgentKernelWorkflow } from './agent-kernel-workflow-validator.js';
import { validateAgentKernelSkillUse } from './agent-kernel-skill-validator.js';
import { buildAgentKernelContextPacket } from './agent-kernel-context-packet.js';
import {
  planAgentKernelProviderRoute,
  type AgentKernelProviderRoutePolicy,
} from './agent-kernel-provider-routing-gateway.js';

function makeRequest(
  overrides: Partial<AgentKernelPlanningRequest> = {},
): AgentKernelPlanningRequest {
  return {
    requestId: 'ak-05-req-1',
    sessionId: 'session-1',
    operatorIntent: 'Plan provider routing for a validated context packet.',
    targetRepository: 'JLPARTIN/JLPARTIN-CodeMind',
    targetRef: 'main',
    requestedMode: 'PLAN',
    requestedRoles: ['orchestrator', 'researcher', 'coder', 'validator'],
    requestedSkills: ['repo-inspection'],
    allowPatchProposal: false,
    ...overrides,
  };
}

function makePolicy(
  overrides: Partial<AgentKernelProviderRoutePolicy> = {},
): AgentKernelProviderRoutePolicy {
  return {
    allowExternalProvider: true,
    preferLocalOnly: false,
    requireWorkflowSummary: true,
    requireSkillSummary: true,
    maxPacketWarnings: 0,
    ...overrides,
  };
}

function makeReadyPacket(maxSections = 8) {
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

  return buildAgentKernelContextPacket({
    packetId: 'packet-ak-05-ready',
    planningDecision: planning,
    workflowValidation,
    skillValidations: [skillValidation],
    repoContext: {
      repository: 'JLPARTIN/JLPARTIN-CodeMind',
      ref: 'main',
    },
    maxSections,
    maxSourceLineageItems: 3,
  });
}

describe('AGENT-KERNEL-05 provider routing gateway', () => {
  it('exposes canonical AGENT-KERNEL-05 lineage and never invokes providers', () => {
    const packet = makeReadyPacket();
    const plan = planAgentKernelProviderRoute(packet, makePolicy());

    expect(plan.blockId).toBe('AGENT-KERNEL-05');
    expect(plan.prId).toBe('PR-AK-05');
    expect(plan.phaseId).toBe('Phase-16G-AK-05');
    expect(plan.providerRouteReady).toBe(true);
    expect(plan.providerInvoked).toBe(false);
    expect(plan.findings.map((finding) => finding.code)).toContain('ROUTE_SELECTED');
  });

  it('selects local-only routing when policy requires local preference', () => {
    const packet = makeReadyPacket();
    const plan = planAgentKernelProviderRoute(
      packet,
      makePolicy({ allowExternalProvider: false, preferLocalOnly: true }),
    );

    expect(plan.providerRouteReady).toBe(true);
    expect(plan.routeType).toBe('LOCAL_ONLY');
    expect(plan.selectedProvider).toBeUndefined();
    expect(plan.providerInvoked).toBe(false);
  });

  it('blocks routing when the context packet is not provider-ready', () => {
    const planning = planAgentKernel01(makeRequest({ operatorIntent: '   ' }));
    const workflowValidation = validateAgentKernelWorkflow(planning);
    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-ak-05-not-ready',
      planningDecision: planning,
      workflowValidation,
      skillValidations: [],
      maxSections: 8,
      maxSourceLineageItems: 3,
    });

    const plan = planAgentKernelProviderRoute(packet, makePolicy());

    expect(plan.providerRouteReady).toBe(false);
    expect(plan.routeType).toBe('NO_ROUTE');
    expect(plan.findings.map((finding) => finding.code)).toContain('PACKET_NOT_READY');
    expect(plan.providerInvoked).toBe(false);
  });

  it('blocks routing when required packet sections are missing', () => {
    const packet = makeReadyPacket(3);
    const plan = planAgentKernelProviderRoute(packet, makePolicy());

    expect(plan.providerRouteReady).toBe(false);
    expect(plan.routeType).toBe('NO_ROUTE');
    expect(plan.findings.map((finding) => finding.code)).toContain('MISSING_REQUIRED_SECTION');
  });

  it('warns when packet warning count exceeds policy maximum without invoking a provider', () => {
    const planning = planAgentKernel01(makeRequest());
    const invalidWorkflow = validateAgentKernelWorkflow({
      ...planning,
      workflowSteps: [],
      operatorCheckpoints: [],
    });
    const packet = buildAgentKernelContextPacket({
      packetId: 'packet-ak-05-warning',
      planningDecision: planning,
      workflowValidation: invalidWorkflow,
      skillValidations: [],
      maxSections: 8,
      maxSourceLineageItems: 3,
    });

    const plan = planAgentKernelProviderRoute(
      { ...packet, providerReady: true },
      makePolicy({ maxPacketWarnings: 0 }),
    );

    expect(plan.findings.map((finding) => finding.code)).toContain('PACKET_HAS_WARNINGS');
    expect(plan.providerInvoked).toBe(false);
  });
});
