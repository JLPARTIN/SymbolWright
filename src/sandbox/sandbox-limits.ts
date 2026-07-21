import type { SandboxLimits } from './sandbox-types.js'

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  timeoutMs: 10_000,
  compileTimeoutMs: 20_000,
  maxMemoryMb: 512,
  maxCpuPercent: 100,
  maxProcesses: 64,
  maxOutputBytes: 64_000,
  maxArtifactBytes: 2_000_000,
  maxFiles: 32,
  maxFileBytes: 128_000,
  maxTotalSourceBytes: 512_000,
  maxStdinBytes: 64_000,
  maxArgs: 32,
  maxArgBytes: 4_000,
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : Math.floor(value)
}

function optionalPositiveNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return Math.floor(value)
}

/**
 * Browser/API callers may tighten limits, but they cannot relax the server defaults.
 * Administrator-level increases can be added later through explicit server config, not request JSON.
 */
export function normalizeSandboxLimits(requested: Partial<SandboxLimits> = {}): SandboxLimits {
  const maxCpuPercent = optionalPositiveNumber(requested.maxCpuPercent)
  return {
    timeoutMs: Math.min(
      positiveNumber(requested.timeoutMs, DEFAULT_SANDBOX_LIMITS.timeoutMs),
      DEFAULT_SANDBOX_LIMITS.timeoutMs,
    ),
    compileTimeoutMs: Math.min(
      positiveNumber(requested.compileTimeoutMs, DEFAULT_SANDBOX_LIMITS.compileTimeoutMs),
      DEFAULT_SANDBOX_LIMITS.compileTimeoutMs,
    ),
    maxMemoryMb: Math.min(
      positiveNumber(requested.maxMemoryMb, DEFAULT_SANDBOX_LIMITS.maxMemoryMb),
      DEFAULT_SANDBOX_LIMITS.maxMemoryMb,
    ),
    ...(maxCpuPercent === undefined
      ? { maxCpuPercent: DEFAULT_SANDBOX_LIMITS.maxCpuPercent }
      : { maxCpuPercent: Math.min(maxCpuPercent, DEFAULT_SANDBOX_LIMITS.maxCpuPercent ?? 100) }),
    maxProcesses: Math.min(
      positiveNumber(requested.maxProcesses, DEFAULT_SANDBOX_LIMITS.maxProcesses),
      DEFAULT_SANDBOX_LIMITS.maxProcesses,
    ),
    maxOutputBytes: Math.min(
      positiveNumber(requested.maxOutputBytes, DEFAULT_SANDBOX_LIMITS.maxOutputBytes),
      DEFAULT_SANDBOX_LIMITS.maxOutputBytes,
    ),
    maxArtifactBytes: Math.min(
      positiveNumber(requested.maxArtifactBytes, DEFAULT_SANDBOX_LIMITS.maxArtifactBytes),
      DEFAULT_SANDBOX_LIMITS.maxArtifactBytes,
    ),
    maxFiles: Math.min(
      positiveNumber(requested.maxFiles, DEFAULT_SANDBOX_LIMITS.maxFiles),
      DEFAULT_SANDBOX_LIMITS.maxFiles,
    ),
    maxFileBytes: Math.min(
      positiveNumber(requested.maxFileBytes, DEFAULT_SANDBOX_LIMITS.maxFileBytes),
      DEFAULT_SANDBOX_LIMITS.maxFileBytes,
    ),
    maxTotalSourceBytes: Math.min(
      positiveNumber(requested.maxTotalSourceBytes, DEFAULT_SANDBOX_LIMITS.maxTotalSourceBytes),
      DEFAULT_SANDBOX_LIMITS.maxTotalSourceBytes,
    ),
    maxStdinBytes: Math.min(
      positiveNumber(requested.maxStdinBytes, DEFAULT_SANDBOX_LIMITS.maxStdinBytes),
      DEFAULT_SANDBOX_LIMITS.maxStdinBytes,
    ),
    maxArgs: Math.min(
      positiveNumber(requested.maxArgs, DEFAULT_SANDBOX_LIMITS.maxArgs),
      DEFAULT_SANDBOX_LIMITS.maxArgs,
    ),
    maxArgBytes: Math.min(
      positiveNumber(requested.maxArgBytes, DEFAULT_SANDBOX_LIMITS.maxArgBytes),
      DEFAULT_SANDBOX_LIMITS.maxArgBytes,
    ),
  }
}
