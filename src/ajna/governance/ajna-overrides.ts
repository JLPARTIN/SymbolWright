export interface AjnaGovernanceOverrideRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly ruleId: string;
  readonly justification: string;
  readonly operatorId?: string;
}

export interface AjnaGovernanceOverrideInput {
  readonly id: string;
  readonly createdAt: string;
  readonly ruleId: string;
  readonly justification: string;
  readonly operatorId?: string;
}

export function createAjnaGovernanceOverride(
  input: AjnaGovernanceOverrideInput,
): AjnaGovernanceOverrideRecord {
  const base = {
    id: input.id,
    createdAt: input.createdAt,
    ruleId: input.ruleId,
    justification: input.justification,
  };

  if (input.operatorId) {
    return {
      ...base,
      operatorId: input.operatorId,
    };
  }

  return base;
}

export function getAjnaOverridesForRule(
  overrides: readonly AjnaGovernanceOverrideRecord[],
  ruleId: string,
): readonly AjnaGovernanceOverrideRecord[] {
  return overrides.filter((override) => override.ruleId === ruleId);
}

export function addAjnaGovernanceOverride(
  overrides: readonly AjnaGovernanceOverrideRecord[],
  next: AjnaGovernanceOverrideRecord,
): readonly AjnaGovernanceOverrideRecord[] {
  return [...overrides, next].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}
