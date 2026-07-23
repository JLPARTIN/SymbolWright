export const CODETELLIGENCE_PLATFORM_NAME = 'Codetelligence' as const
export const CODETELLIGENCE_PACKAGE_NAME = 'codetelligence' as const
export const CODETELLIGENCE_CLI_NAME = 'codetelligence' as const
export const CODETELLIGENCE_WORKSPACE_CLI_NAME = 'codetelligence-workspace' as const
export const CODETELLIGENCE_ENV_PREFIX = 'CODETELLIGENCE' as const
export const CODETELLIGENCE_STORAGE_DIRECTORY = '.codetelligence' as const
export const CODETELLIGENCE_MCP_SERVER_NAME = 'codetelligence' as const
export const CODETELLIGENCE_REPOSITORY_NAME = 'Codetelligence' as const

export const LEGACY_CODEMIND_PLATFORM_NAME = 'CodeMind' as const
export const LEGACY_CODEMIND_PACKAGE_NAME = 'codemind' as const
export const LEGACY_CODEMIND_CLI_NAME = 'codemind' as const
export const LEGACY_CODEMIND_WORKSPACE_CLI_NAME = 'codemind-workspace' as const
export const LEGACY_CODEMIND_ENV_PREFIX = 'CODEMIND' as const
export const LEGACY_CODEMIND_STORAGE_DIRECTORY = '.codemind' as const
export const LEGACY_CODEMIND_MCP_SERVER_NAME = 'codemind' as const

export type BrandEnvironmentSource = 'codetelligence' | 'codemind' | 'unset'

export interface BrandEnvironmentValue {
  readonly value?: string
  readonly source: BrandEnvironmentSource
  readonly variableName?: string
  readonly legacy: boolean
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized.length === 0 ? undefined : normalized
}

export function codetelligenceEnvironmentVariable(suffix: string): string {
  return `${CODETELLIGENCE_ENV_PREFIX}_${suffix}`
}

export function legacyCodeMindEnvironmentVariable(suffix: string): string {
  return `${LEGACY_CODEMIND_ENV_PREFIX}_${suffix}`
}

export function readBrandEnvironmentValue(
  env: Readonly<Record<string, string | undefined>>,
  suffix: string,
): BrandEnvironmentValue {
  const canonicalName = codetelligenceEnvironmentVariable(suffix)
  const canonicalValue = nonEmpty(env[canonicalName])
  if (canonicalValue !== undefined) {
    return {
      value: canonicalValue,
      source: 'codetelligence',
      variableName: canonicalName,
      legacy: false,
    }
  }

  const legacyName = legacyCodeMindEnvironmentVariable(suffix)
  const legacyValue = nonEmpty(env[legacyName])
  if (legacyValue !== undefined) {
    return {
      value: legacyValue,
      source: 'codemind',
      variableName: legacyName,
      legacy: true,
    }
  }

  return { source: 'unset', legacy: false }
}

export function renderLegacyEnvironmentWarning(suffix: string): string {
  return `${legacyCodeMindEnvironmentVariable(suffix)} is deprecated; use ${codetelligenceEnvironmentVariable(suffix)}.`
}
