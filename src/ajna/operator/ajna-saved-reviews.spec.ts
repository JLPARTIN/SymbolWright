import { describe, expect, it } from 'vitest';

import {
  createAjnaSavedReviewRecord,
  deleteAjnaSavedReview,
  findAjnaSavedReview,
  upsertAjnaSavedReview,
} from './ajna-saved-reviews.js';
import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js';

function makeReview(repository = 'owner/repo'): AjnaReviewPanelViewModel {
  return {
    repository,
    pullRequestNumber: 14,
    readiness: {
      ruling: 'READY_TO_REVIEW',
      confidence: 0.8,
      summary: 'Ready for operator review.',
      operatorDecisionRequired: true,
    },
    riskLanes: [],
    commentPreview: {
      enabled: false,
      markdown: 'Preview',
      dryRun: true,
    },
  };
}

describe('Ajna saved reviews', () => {
  it('creates deterministic saved review records', () => {
    const record = createAjnaSavedReviewRecord({
      id: 'review-1',
      savedAt: '2026-05-28T00:00:00.000Z',
      review: makeReview(),
    });

    expect(record.id).toBe('review-1');
    expect(record.label).toBe('owner/repo#14');
  });

  it('upserts, finds, and deletes records without mutating the source list', () => {
    const first = createAjnaSavedReviewRecord({
      id: 'review-1',
      savedAt: '2026-05-28T00:00:00.000Z',
      review: makeReview('owner/first'),
    });
    const updated = createAjnaSavedReviewRecord({
      id: 'review-1',
      savedAt: '2026-05-28T00:01:00.000Z',
      review: makeReview('owner/updated'),
    });

    const records = upsertAjnaSavedReview([], first);
    const updatedRecords = upsertAjnaSavedReview(records, updated);

    expect(records).toHaveLength(1);
    expect(updatedRecords).toHaveLength(1);
    expect(findAjnaSavedReview(updatedRecords, 'review-1')?.review.repository).toBe(
      'owner/updated',
    );
    expect(deleteAjnaSavedReview(updatedRecords, 'review-1')).toEqual([]);
  });
});
