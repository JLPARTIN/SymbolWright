import { describe, expect, it } from 'vitest';

import {
  buildAjnaReviewSession,
  AJNA_REVIEW_SESSION_BLOCK_ID,
  AJNA_REVIEW_SESSION_PHASE_ID,
  AJNA_REVIEW_SESSION_PR_ID,
} from './ajna-review-session.js';

const VALID_IDENTITY = {
  repository: 'JLPARTIN/JLPARTIN-CodeMind',
  pullRequestNumber: 35,
  headSha: 'abc1234567890def',
  baseSha: 'def1234567890abc',
};

describe('Ajna Review Session', () => {
  it('creates canonical review session', () => {
    const session = buildAjnaReviewSession({ identity: VALID_IDENTITY });

    expect(session.blockId).toBe(AJNA_REVIEW_SESSION_BLOCK_ID);
    expect(session.prId).toBe(AJNA_REVIEW_SESSION_PR_ID);
    expect(session.phaseId).toBe(AJNA_REVIEW_SESSION_PHASE_ID);
    expect(session.identity).toEqual(VALID_IDENTITY);
    expect(session.sessionId).toBeTruthy();
  });

  it('emits deterministic block/pr/phase IDs', () => {
    const s1 = buildAjnaReviewSession({ identity: VALID_IDENTITY });
    const s2 = buildAjnaReviewSession({ identity: VALID_IDENTITY });

    expect(s1.blockId).toBe(s2.blockId);
    expect(s1.prId).toBe(s2.prId);
    expect(s1.phaseId).toBe(s2.phaseId);
    expect(s1.sessionId).toBe(s2.sessionId);
  });

  it('derives sessionId deterministically from identity', () => {
    const session = buildAjnaReviewSession({ identity: VALID_IDENTITY });

    expect(session.sessionId).toContain('JLPARTIN/JLPARTIN-CodeMind');
    expect(session.sessionId).toContain('35');
    expect(session.sessionId).toContain('abc123456789');
  });

  it('requires repository name', () => {
    expect(() =>
      buildAjnaReviewSession({
        identity: { ...VALID_IDENTITY, repository: '' },
      }),
    ).toThrow('repository');
  });

  it('rejects whitespace-only repository name', () => {
    expect(() =>
      buildAjnaReviewSession({
        identity: { ...VALID_IDENTITY, repository: '   ' },
      }),
    ).toThrow('repository');
  });

  it('requires pull request number to be positive', () => {
    expect(() =>
      buildAjnaReviewSession({
        identity: { ...VALID_IDENTITY, pullRequestNumber: 0 },
      }),
    ).toThrow('pullRequestNumber');
  });

  it('rejects negative pull request number', () => {
    expect(() =>
      buildAjnaReviewSession({
        identity: { ...VALID_IDENTITY, pullRequestNumber: -1 },
      }),
    ).toThrow('pullRequestNumber');
  });

  it('rejects invalid PR identity (all fields empty/zero)', () => {
    expect(() =>
      buildAjnaReviewSession({
        identity: {
          repository: '',
          pullRequestNumber: 0,
          headSha: '',
          baseSha: '',
        },
      }),
    ).toThrow();
  });

  it('requires head SHA', () => {
    expect(() =>
      buildAjnaReviewSession({
        identity: { ...VALID_IDENTITY, headSha: '' },
      }),
    ).toThrow('headSha');
  });

  it('requires base SHA', () => {
    expect(() =>
      buildAjnaReviewSession({
        identity: { ...VALID_IDENTITY, baseSha: '' },
      }),
    ).toThrow('baseSha');
  });

  it('keeps providerInvocationAllowed false', () => {
    const session = buildAjnaReviewSession({ identity: VALID_IDENTITY });
    expect(session.providerInvocationAllowed).toBe(false);
  });

  it('keeps repoMutationAllowed false', () => {
    const session = buildAjnaReviewSession({ identity: VALID_IDENTITY });
    expect(session.repoMutationAllowed).toBe(false);
  });

  it('keeps githubWriteAllowed false', () => {
    const session = buildAjnaReviewSession({ identity: VALID_IDENTITY });
    expect(session.githubWriteAllowed).toBe(false);
  });

  it('keeps commandExecutionAllowed false', () => {
    const session = buildAjnaReviewSession({ identity: VALID_IDENTITY });
    expect(session.commandExecutionAllowed).toBe(false);
  });

  it('includes createdAtIso when supplied', () => {
    const session = buildAjnaReviewSession({
      identity: VALID_IDENTITY,
      createdAtIso: '2026-05-29T00:00:00.000Z',
    });
    expect(session.createdAtIso).toBe('2026-05-29T00:00:00.000Z');
  });

  it('sets createdAtIso to empty string when omitted', () => {
    const session = buildAjnaReviewSession({ identity: VALID_IDENTITY });
    expect(session.createdAtIso).toBe('');
  });
});
