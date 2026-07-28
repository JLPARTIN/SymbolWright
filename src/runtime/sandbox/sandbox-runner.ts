// Compatibility import surface retained for runtime tools and downstream callers.
// All policy resolution, Docker argument construction, process spawning, output limiting, and
// fail-closed behavior now live inside the authoritative sandbox domain.
export {
  DEFAULT_DOCKER_IMAGE,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_SANDBOX_CPUS,
  DEFAULT_SANDBOX_MEMORY,
  DEFAULT_SANDBOX_NETWORK,
  DEFAULT_SANDBOX_USER,
  DEFAULT_TIMEOUT_MS,
  DockerSandboxFileWriter,
  DockerSandboxRunner,
  buildDockerFileWriteArgs,
  buildDockerRunArgs,
  parseWorkspaceCommand,
  renderDockerSandboxConfig,
  renderSandboxCommand,
  resolveDefaultSandboxUser,
  resolveDockerSandboxConfig,
  resolveDockerSandboxRunnerOptionsFromEnv,
} from '../../sandbox/sandbox-command-backend.js'

export type {
  DockerSandboxResolvedConfig,
  DockerSandboxRunnerOptions,
  ParsedWorkspaceCommand,
  SandboxCommandBinary,
  SandboxCommandRequest,
  SandboxFileWriteOutcome,
  SandboxFileWriteRequest,
  SandboxFileWriteResult,
  SandboxFileWriter,
  SandboxRunner,
  SandboxRunnerOutcome,
  SandboxRunnerResult,
} from '../../sandbox/sandbox-command-backend.js'
