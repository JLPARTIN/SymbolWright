export interface AjnaTimelineStep {
  readonly label: string;
  readonly detail: string;
  readonly status: 'INFO' | 'PASS' | 'WARN' | 'BLOCKED';
}

export interface AjnaTimelineInput {
  readonly changedFileCount: number;
  readonly riskLanes: readonly string[];
  readonly ciHealthy: boolean;
  readonly readinessRuling: string;
}

export function buildAjnaTimeline(
  input: AjnaTimelineInput,
): readonly AjnaTimelineStep[] {
  return [
    {
      label: 'Scope Loaded',
      detail: `${input.changedFileCount} changed file(s) loaded for review.`,
      status: 'INFO',
    },
    {
      label: 'Risk Lanes Identified',
      detail: input.riskLanes.length > 0 ? input.riskLanes.join(', ') : 'No risk lanes detected.',
      status: input.riskLanes.length > 0 ? 'WARN' : 'PASS',
    },
    {
      label: 'CI Signals Evaluated',
      detail: input.ciHealthy ? 'CI appears healthy.' : 'CI has failures or pending checks.',
      status: input.ciHealthy ? 'PASS' : 'WARN',
    },
    {
      label: 'Readiness Decision',
      detail: input.readinessRuling,
      status: input.readinessRuling.startsWith('BLOCKED') ? 'BLOCKED' : 'INFO',
    },
  ];
}
