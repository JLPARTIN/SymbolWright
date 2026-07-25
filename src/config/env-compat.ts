/**
 * Central compatibility helper for the SYMBOLWRIGHT_* / legacy CODEMIND_*
 * environment-variable rename. The canonical `SYMBOLWRIGHT_*` name always
 * wins; the legacy `CODEMIND_*` name is read as a fallback when the
 * canonical one is unset. If both are set to different values, a warning is
 * emitted (never including the raw value for `sensitive` variables) and the
 * canonical value is used — the legacy value is never silently preferred.
 */
export interface EnvCompatOptions {
  readonly env: Record<string, string | undefined>
  /** When true, the conflict warning omits both raw values. */
  readonly sensitive?: boolean
}

export function readEnvWithLegacyFallback(
  canonicalName: string,
  legacyName: string,
  options: EnvCompatOptions,
): string | undefined {
  const { env, sensitive = false } = options
  const canonicalValue = env[canonicalName]
  const legacyValue = env[legacyName]

  const hasCanonical = canonicalValue !== undefined && canonicalValue !== ''
  const hasLegacy = legacyValue !== undefined && legacyValue !== ''

  if (hasCanonical) {
    if (hasLegacy && legacyValue !== canonicalValue) {
      const detail = sensitive ? '' : ` (${legacyName}="${legacyValue}")`
      console.error(
        `[symbolwright] warning: both ${canonicalName} and legacy ${legacyName} are set to ` +
          `different values; using ${canonicalName}.${detail}`,
      )
    }
    return canonicalValue
  }

  if (hasLegacy) {
    return legacyValue
  }

  return undefined
}
