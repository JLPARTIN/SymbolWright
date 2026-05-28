import { describe, expect, it } from 'vitest';

import { planAgentKernel01 } from './agent-kernel-planner.js';
import type {
  AgentKernelPlanningDecision,
  AgentKernelPlanningRequest,
} from './agent-kernel.types.js';
import { validateAgentKernelWorkflow } from './agent-kernel-workflow-validator.js';

function makeRequest(
  overrides: Partial<AgentKernelPlanningRequest> = {},
): AgentKernelPlanningRequest {
  return {
    requestId: 'ak-02-req-1',
    sessionId: 'session-1',
    operatorIntent: 'Validate the Agent Kernel workflow.',
    targetRepository: 'JLPARTIN/JLPARTIN-CodeMind',
    targetRef: 'main',
    requestedMode: 'PLAN',
    requestedRoles: ['orchestrator', 'researcher', 'coder', 'validator'],
    requestedSkills: [],
    allowPatchProposal: true,
    ...overrides,
  };
}

function makeDecision(
  overrides: Partial<AgentKernelPlanningDecision> = {},
): AgentKernelPlanningDecision {
  const decision = planAgentKernel01(makeRequest());

  return {
    ...decision,
    ...overrides,
  };
}

describe('AGENT-KERNEL-02 workflow validator', () => {
  it('accepts a valid AGENT-KERNEL-01 planning decision', () => {
    const report = validateAgentKernelWorkflow(makeDecision());

    expect(report.valid).toBe(true);
    expect(report.validatorBlockId).toBe('AGENT-KERNEL-02');
    expect(report.validatorPrId).toBe('PR-AK-02');
    expect(report.validatorPhaseId).toBe('Phase-16G-AK-02');
    expect(report.findings).toEqual([]);
    expect(report.mutationBlocked).toBe(true);
  });

  it('rejects empty workflows', () => {
    const report = validateAgentKernelWorkflow(
      makeDecision({ workflowSteps: [], operatorCheckpoints: [] }),
    );

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain('EMPTY_WORKFLOW');
    expect(report.findings.map((finding) => finding.code)).toContain(
      'MISSING_OPERATOR_CHECKPOINT',
    );
  });

  it('rejects duplicate step ids', () => {
    const decision = makeDecision();
    const firstStep = decision.workflowSteps[0];
    expect(firstStep).toBeDefined();

    const report = validateAgentKernelWorkflow(
      makeDecision({ workflowSteps: [firstStep!, firstStep!] }),
    );

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain('DUPLICATE_STEP_ID');
  });

  it('rejects unknown workflow step skills', () => {
    const decision = makeDecision();
    const firstStep = decision.workflowSteps[0];
    expect(firstStep).toBeDefined();

    const report = validateAgentKernelWorkflow(
      makeDecision({
        workflowSteps: [
          {
            ...firstStep!,
            skillId: 'unknown-skill',
          },
        ],
      }),
    );

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain('UNKNOWN_SKILL');
  });

  it('rejects mutation-capable workflow steps', () => {
    const decision = makeDecision();
    const firstStep = decision.workflowSteps[0];
    expect(firstStep).toBeDefined();

    const report = validateAgentKernelWorkflow(
      makeDecision({
        workflowSteps: [
          {
            ...firstStep!,
            allowedToMutate: true,
          },
        ],
      }),
    );

    expect(report.valid).toBe(false);
    expect(report.mutationBlocked).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain('MUTATION_NOT_ALLOWED');
  });

  it('requires patch proposal steps to have approval checkpoints', () => {
    const decision = planAgentKernel01(makeRequest({ requestedMode: 'PATCH_PROPOSAL' }));
    const patchStep = decision.workflowSteps.find((step) => step.kind === 'patch-proposal');
    expect(patchStep).toBeDefined();

    const report = validateAgentKernelWorkflow(
      makeDecision({
        workflowSteps: [
          {
            ...patchStep!,
            approvalCheckpoint: false,
          },
        ],
        operatorCheckpoints: [],
      }),
    );

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain(
      'PATCH_PROPOSAL_REQUIRES_CHECKPOINT',
    );
  });

  it('rejects operator checkpoints that do not point to approval checkpoint steps', () => {
    const decision = makeDecision();
    const firstStep = decision.workflowSteps[0];
    expect(firstStep).toBeDefined();

    const report = validateAgentKernelWorkflow(
      makeDecision({
        workflowSteps: [
          {
            ...firstStep!,
            approvalCheckpoint: false,
          },
        ],
        operatorCheckpoints: [firstStep!.stepId, 'missing-step'],
      }),
    );

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain(
      'INVALID_OPERATOR_CHECKPOINT',
    );
  });
});
