import { describe, expect, it } from 'vitest';

import { buildAjnaTimeline } from './ajna-timeline.js';

describe('Ajna timeline', () => {
  it('builds a review timeline with scope, risk, CI, and readiness steps', () => {
    const timeline = buildAjnaTimeline({
      changedFileCount: 3,
      riskLanes: ['ci', 'tests'],
      ciHealthy: false,
      readinessRuling: 'BLOCKED_BY_CI',
    });

    expect(timeline).toHaveLength(4);
    expect(timeline[0]?.label).toBe('Scope Loaded');
    expect(timeline[1]?.detail).toBe('ci, tests');
    expect(timeline[2]?.status).toBe('WARN');
    expect(timeline[3]?.status).toBe('BLOCKED');
  });

  it('marks empty risk lanes and healthy CI as pass states', () => {
    const timeline = buildAjnaTimeline({
      changedFileCount: 0,
      riskLanes: [],
      ciHealthy: true,
      readinessRuling: 'MERGE_READY_WITH_EVIDENCE',
    });

    expect(timeline[1]?.status).toBe('PASS');
    expect(timeline[1]?.detail).toBe('No risk lanes detected.');
    expect(timeline[2]?.status).toBe('PASS');
  });
});
