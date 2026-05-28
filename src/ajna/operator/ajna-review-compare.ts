import type {
  AjnaReviewPanelViewModel,
  AjnaUiCiSummaryViewModel,
  AjnaUiFileInsightViewModel,
  AjnaUiReadinessViewModel,
  AjnaUiRiskLane,
} from '../ui/ajna-ui.types.js';

export interface AjnaReadinessComparison {
  readonly left: AjnaUiReadinessViewModel;
  readonly right: AjnaUiReadinessViewModel;
  readonly confidenceDelta: number;
  readonly rulingChanged: boolean;
}

export interface AjnaRiskLaneComparison {
  readonly added: readonly AjnaUiRiskLane[];
  readonly removed: readonly AjnaUiRiskLane[];
  readonly unchanged: readonly AjnaUiRiskLane[];
}

export type AjnaFileDriftType = 'ADDED' | 'REMOVED' | 'MODIFIED';

export interface AjnaFileInsightDrift {
  readonly path: string;
  readonly type: AjnaFileDriftType;
  readonly scoreDelta: number;
  readonly left?: AjnaUiFileInsightViewModel;
  readonly right?: AjnaUiFileInsightViewModel;
}

export interface AjnaCiComparison {
  readonly successfulDelta: number;
  readonly failedDelta: number;
  readonly pendingDelta: number;
  readonly neutralDelta: number;
  readonly healthChanged: boolean;
}

export interface AjnaReviewComparisonReport {
  readonly readiness: AjnaReadinessComparison;
  readonly lanes: AjnaRiskLaneComparison;
  readonly files: readonly AjnaFileInsightDrift[];
  readonly ci: AjnaCiComparison;
}

function confidenceDelta(left: number, right: number): number {
  return Number((right - left).toFixed(4));
}

export function compareAjnaReadiness(
  left: AjnaReviewPanelViewModel,
  right: AjnaReviewPanelViewModel,
): AjnaReadinessComparison {
  return {
    left: left.readiness,
    right: right.readiness,
    confidenceDelta: confidenceDelta(
      left.readiness.confidence,
      right.readiness.confidence,
    ),
    rulingChanged: left.readiness.ruling !== right.readiness.ruling,
  };
}

export function compareAjnaRiskLanes(
  left: AjnaReviewPanelViewModel,
  right: AjnaReviewPanelViewModel,
): AjnaRiskLaneComparison {
  const leftLanes = new Set(left.riskLanes.map((lane) => lane.lane));
  const rightLanes = new Set(right.riskLanes.map((lane) => lane.lane));

  return {
    added: [...rightLanes].filter((lane) => !leftLanes.has(lane)),
    removed: [...leftLanes].filter((lane) => !rightLanes.has(lane)),
    unchanged: [...rightLanes].filter((lane) => leftLanes.has(lane)),
  };
}

export function compareAjnaFileInsights(
  left: AjnaReviewPanelViewModel,
  right: AjnaReviewPanelViewModel,
): readonly AjnaFileInsightDrift[] {
  const leftFiles = new Map(
    (left.fileInsights ?? []).map((file) => [file.path, file] as const),
  );
  const rightFiles = new Map(
    (right.fileInsights ?? []).map((file) => [file.path, file] as const),
  );
  const allPaths = new Set([...leftFiles.keys(), ...rightFiles.keys()]);
  const drift: AjnaFileInsightDrift[] = [];

  for (const path of allPaths) {
    const leftFile = leftFiles.get(path);
    const rightFile = rightFiles.get(path);

    if (!leftFile && rightFile) {
      drift.push({
        path,
        type: 'ADDED',
        scoreDelta: rightFile.score,
        right: rightFile,
      });
      continue;
    }

    if (leftFile && !rightFile) {
      drift.push({
        path,
        type: 'REMOVED',
        scoreDelta: -leftFile.score,
        left: leftFile,
      });
      continue;
    }

    if (leftFile && rightFile) {
      const delta = rightFile.score - leftFile.score;
      if (delta !== 0 || leftFile.severity !== rightFile.severity) {
        drift.push({
          path,
          type: 'MODIFIED',
          scoreDelta: delta,
          left: leftFile,
          right: rightFile,
        });
      }
    }
  }

  return drift.sort((leftDrift, rightDrift) =>
    leftDrift.path.localeCompare(rightDrift.path),
  );
}

function safeCiSummary(
  summary?: AjnaUiCiSummaryViewModel,
): AjnaUiCiSummaryViewModel {
  return (
    summary ?? {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      neutral: 0,
      healthy: false,
    }
  );
}

export function compareAjnaCiSignals(
  left: AjnaReviewPanelViewModel,
  right: AjnaReviewPanelViewModel,
): AjnaCiComparison {
  const leftCi = safeCiSummary(left.ciSummary);
  const rightCi = safeCiSummary(right.ciSummary);

  return {
    successfulDelta: rightCi.successful - leftCi.successful,
    failedDelta: rightCi.failed - leftCi.failed,
    pendingDelta: rightCi.pending - leftCi.pending,
    neutralDelta: rightCi.neutral - leftCi.neutral,
    healthChanged: leftCi.healthy !== rightCi.healthy,
  };
}

export function buildAjnaReviewComparisonReport(
  left: AjnaReviewPanelViewModel,
  right: AjnaReviewPanelViewModel,
): AjnaReviewComparisonReport {
  return {
    readiness: compareAjnaReadiness(left, right),
    lanes: compareAjnaRiskLanes(left, right),
    files: compareAjnaFileInsights(left, right),
    ci: compareAjnaCiSignals(left, right),
  };
}
