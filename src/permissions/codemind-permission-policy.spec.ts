import { describe, expect, it } from 'vitest';

import {
  evaluateCodemindPermissionRequest,
  resolveHighestDisposition,
} from './codemind-permission-policy.js';
import type { CodemindPermissionRequest } from './codemind-permission.types.js';

function makeRequest(
  overrides: Partial<CodemindPermissionRequest> = {},
): CodemindPermissionRequest {
  return {
    requestId: 'req-1',
    sessionId: 'session-1',
    mode: 'PLAN',
    toolCategory: 'PLANNER',
    action: 'plan work',
    targets: [],
    sourceTrustZone: 'OPERATOR_SESSION',
    operatorApproved: false,
    ...overrides,
  };
}

describe('CodeMind permission policy', () => {
  it('resolves DENY over ASK over ALLOW', () => {
    expect(resolveHighestDisposition(['ALLOW', 'ASK'])).toBe('ASK');
    expect(resolveHighestDisposition(['ALLOW', 'DENY'])).toBe('DENY');
    expect(resolveHighestDisposition(['ALLOW', 'ASK', 'DENY'])).toBe('DENY');
  });

  it('defaults empty disposition sets to ASK', () => {
    expect(resolveHighestDisposition([])).toBe('ASK');
  });

  it('keeps unapproved requests behind an ASK decision for non-mutating tools', () => {
    const decision = evaluateCodemindPermissionRequest(makeRequest());

    expect(decision.disposition).toBe('ASK');
    expect(decision.operatorApprovalRequired).toBe(true);
    expect(decision.deniedByInvariant).toBe(false);
  });

  it('allows approved read-only requests without protected targets', () => {
    const decision = evaluateCodemindPermissionRequest(
      makeRequest({
        toolCategory: 'FILE_READER',
        operatorApproved: true,
        targets: [{ kind: 'file', value: 'src/index.ts' }],
      }),
    );

    expect(decision.disposition).toBe('ALLOW');
    expect(decision.operatorApprovalRequired).toBe(false);
    expect(decision.auditRequired).toBe(false);
  });

  it('denies unapproved mutating tools', () => {
    const decision = evaluateCodemindPermissionRequest(
      makeRequest({
        toolCategory: 'GITHUB_MUTATOR',
        action: 'open pull request',
      }),
    );

    expect(decision.disposition).toBe('DENY');
    expect(decision.deniedByInvariant).toBe(true);
  });

  it('blocks protected environment config targets by default', () => {
    const decision = evaluateCodemindPermissionRequest(
      makeRequest({
        toolCategory: 'FILE_READER',
        operatorApproved: true,
        targets: [{ kind: 'file', value: '.env' }],
      }),
    );

    expect(decision.disposition).toBe('DENY');
    expect(decision.protectedPathHits).toHaveLength(1);
    expect(decision.protectedPathHits[0]?.protectedClass).toBe('SENSITIVE_CONFIG');
  });

  it('requires explicit review for workflow targets', () => {
    const decision = evaluateCodemindPermissionRequest(
      makeRequest({
        toolCategory: 'PROJECT_DOC_WRITER',
        operatorApproved: true,
        targets: [{ kind: 'file', value: '.github/workflows/ci.yml' }],
      }),
    );

    expect(decision.disposition).toBe('ASK');
    expect(decision.auditRequired).toBe(true);
    expect(decision.protectedPathHits[0]?.protectedClass).toBe('CI_WORKFLOW');
  });
});
