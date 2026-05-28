import { describe, expect, it } from 'vitest';

import type {
  AgentKernelProviderRoutePlan,
  AgentKernelProviderRoutePolicy,
} from './agent-kernel-provider-routing-gateway.js';
import {
  planAgentKernelProviderRoute,
} from './agent-kernel-provider-routing-gateway.js';
import type { AgentKernelContextPacket } from './agent-kernel-context-packet.js';
import type { AgentKernelRouteExecutionPolicy } from './agent-kernel-route-execution-preflight.js';
import { preflightAgentKernelRouteExecution } from './agent-kernel-route-execution-preflight.js';

function makePacket(overrides: Partial<AgentKernelContextPacket> = {}): AgentKernelContextPacket {
  return {
    packetId: 'packet-ak-06',
    blockId: 'AGENT-KERNEL-04',
    prId: 'PR-AK-04',
    phaseId: 'Phase-16G-AK-04',
    sourcePlanningRequestId: 'ak-06-req-1',
    providerReady: true,
    providerInvoked: false,
    items: [
      {
        section: 'operator-intent',
        priority: 'CRITICAL',
        title: 'Operator Intent',
        content: 'Plan route execution preflight.',
      },
      {
        section: 'workflow-validation',
        priority: 'MEDIUM',
        title: 'Workflow Validation Summary',
        content: 'valid=true; findings=0; mutationBlocked=true',
      },
      {
        section: 'skill-validation',
        priority: 'MEDIUM',
        title: 'Skill Validation Summary',
        content: 'reports=1; invalid=0',
      },
    ],
    boundary: {
      maxSections: 8,
      maxSourceLineageItems: 3,
      emittedSections: 3,
      truncated: false,
      omittedSections: [],
    },
    warnings: [],
    ...overrides,
  };
}

function makeRoutePolicy(
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

function makeExecutionPolicy(
  overrides: Partial<AgentKernelRouteExecutionPolicy> = {},
): AgentKernelRouteExecutionPolicy {
  return {
    allowedRouteTypes: ['LOCAL_ONLY', 'LIGHTWEIGHT_REASONING', 'DEEP_REASONING', 'AUDIT_REVIEW'],
    allowExternalProviderRoutes: true,
    operatorApprovedExternalRoute: true,
    blockOnRouteWarnings: true,
    ...overrides,
  };
}

function makeRoutePlan(
  routePolicyOverrides: Partial<AgentKernelProviderRoutePolicy> = {},
): AgentKernelProviderRoutePlan {
  return planAgentKernelProviderRoute(makePacket(), makeRoutePolicy(routePolicyOverrides));
}

describe('AGENT-KERNEL-06 route execution preflight', () => {
  it('accepts local-only ready routes while preserving no-execution invariants', () => {
    const routePlan = makeRoutePlan({ allowExternalProvider: false, preferLocalOnly: true });
    const decision = preflightAgentKernelRouteExecution(routePlan, makeExecutionPolicy());

    expect(decision.blockId).toBe('AGENT-KERNEL-06');
    expect(decision.prId).toBe('PR-AK-06');
    expect(decision.phaseId).toBe('Phase-16G-AK-06');
    expect(decision.accepted).toBe(true);
    expect(decision.executionReady).toBe(true);
    expect(decision.providerInvoked).toBe(false);
    expect(decision.repoMutationAllowed).toBe(false);
    expect(decision.commandExecutionAllowed).toBe(false);
    expect(decision.findings.map((finding) => finding.code)).toContain('PREFLIGHT_ACCEPTED');
  });

  it('blocks NO_ROUTE plans', () => {
    const noRoutePlan = planAgentKernelProviderRoute(
      makePacket({ providerReady: false }),
      makeRoutePolicy(),
    );
    const decision = preflightAgentKernelRouteExecution(noRoutePlan, makeExecutionPolicy());

    expect(decision.accepted).toBe(false);
    expect(decision.executionReady).toBe(false);
    expect(decision.routeType).toBe('NO_ROUTE');
    expect(decision.findings.map((finding) => finding.code)).toContain('ROUTE_NOT_READY');
    expect(decision.findings.map((finding) => finding.code)).toContain('ROUTE_TYPE_BLOCKED');
  });

  it('requires operator approval for external provider routes', () => {
    const routePlan = makeRoutePlan();
    const decision = preflightAgentKernelRouteExecution(
      routePlan,
      makeExecutionPolicy({ operatorApprovedExternalRoute: false }),
    );

    expect(routePlan.routeType).not.toBe('LOCAL_ONLY');
    expect(decision.accepted).toBe(false);
    expect(decision.findings.map((finding) => finding.code)).toContain(
      'EXTERNAL_ROUTE_REQUIRES_APPROVAL',
    );
  });

  it('blocks external routes when policy disallows them', () => {
    const routePlan = makeRoutePlan();
    const decision = preflightAgentKernelRouteExecution(
      routePlan,
      makeExecutionPolicy({ allowExternalProviderRoutes: false }),
    );

    expect(decision.accepted).toBe(false);
    expect(decision.findings.map((finding) => finding.code)).toContain('ROUTE_TYPE_BLOCKED');
  });

  it('blocks warning-heavy route plans when configured', () => {
    const routePlan = planAgentKernelProviderRoute(
      makePacket({ warnings: ['warn'] }),
      makeRoutePolicy({ maxPacketWarnings: 0 }),
    );
    const decision = preflightAgentKernelRouteExecution(routePlan, makeExecutionPolicy());

    expect(routePlan.findings.map((finding) => finding.code)).toContain('PACKET_HAS_WARNINGS');
    expect(decision.accepted).toBe(false);
    expect(decision.findings.map((finding) => finding.code)).toContain('ROUTE_FINDINGS_BLOCKING');
  });

  it('blocks route types outside the allowed execution policy', () => {
    const routePlan = makeRoutePlan({ allowExternalProvider: false, preferLocalOnly: true });
    const decision = preflightAgentKernelRouteExecution(
      routePlan,
      makeExecutionPolicy({ allowedRouteTypes: ['DEEP_REASONING'] }),
    );

    expect(routePlan.routeType).toBe('LOCAL_ONLY');
    expect(decision.accepted).toBe(false);
    expect(decision.findings.map((finding) => finding.code)).toContain('ROUTE_TYPE_BLOCKED');
  });
});
