import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js';

export interface AjnaSavedReviewRecord {
  readonly id: string;
  readonly savedAt: string;
  readonly label: string;
  readonly review: AjnaReviewPanelViewModel;
}

export interface AjnaSavedReviewInput {
  readonly id: string;
  readonly savedAt: string;
  readonly label?: string;
  readonly review: AjnaReviewPanelViewModel;
}

export function createAjnaSavedReviewRecord(
  input: AjnaSavedReviewInput,
): AjnaSavedReviewRecord {
  return {
    id: input.id,
    savedAt: input.savedAt,
    label:
      input.label ??
      `${input.review.repository}#${input.review.pullRequestNumber ?? 'unknown'}`,
    review: input.review,
  };
}

export function upsertAjnaSavedReview(
  records: readonly AjnaSavedReviewRecord[],
  next: AjnaSavedReviewRecord,
): readonly AjnaSavedReviewRecord[] {
  const filtered = records.filter((record) => record.id !== next.id);
  return [...filtered, next].sort((left, right) =>
    left.savedAt.localeCompare(right.savedAt),
  );
}

export function deleteAjnaSavedReview(
  records: readonly AjnaSavedReviewRecord[],
  id: string,
): readonly AjnaSavedReviewRecord[] {
  return records.filter((record) => record.id !== id);
}

export function findAjnaSavedReview(
  records: readonly AjnaSavedReviewRecord[],
  id: string,
): AjnaSavedReviewRecord | undefined {
  return records.find((record) => record.id === id);
}
