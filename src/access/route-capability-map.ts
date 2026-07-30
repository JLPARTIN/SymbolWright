import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from './sandbox-capabilities.js'

/**
 * Maps HTTP entry points to the capability an agent-token-authenticated caller needs before the
 * request may proceed. This is the fail-closed allowlist for agent principals: a route with no
 * entry here is refused for an agent (`CAPABILITY_NOT_GRANTED` / route-not-permitted), even though
 * the legacy local operator (authenticated via `SYMBOLWRIGHT_API_KEY`) continues to reach it
 * unrestricted, exactly as before delegated agent access existed.
 */
export interface RouteCapabilityRule {
  readonly method: string
  readonly matcher: RegExp
  readonly capability: string
}

const RULES: readonly RouteCapabilityRule[] = [
  { method: 'GET', matcher: /^\/api\/repository\/tree$/, capability: 'repo.metadata.read' },
  { method: 'GET', matcher: /^\/api\/repository\/file$/, capability: 'repo.content.read' },
  { method: 'GET', matcher: /^\/api\/repository\/status$/, capability: 'repo.metadata.read' },
  { method: 'GET', matcher: /^\/api\/repository\/diff$/, capability: 'repo.history.read' },
  { method: 'GET', matcher: /^\/api\/repository\/branches$/, capability: 'repo.branches.read' },
  { method: 'PUT', matcher: /^\/api\/repository\/file$/, capability: 'repo.content.update' },
  { method: 'POST', matcher: /^\/api\/repository\/branches$/, capability: 'repo.branch.create' },
  { method: 'POST', matcher: /^\/api\/repository\/commit$/, capability: 'repo.commit.create' },
  { method: 'POST', matcher: /^\/api\/repository\/push$/, capability: 'repo.commit.push' },
  {
    method: 'POST',
    matcher: /^\/api\/repository\/pull-request$/,
    capability: 'repo.pull_request.create',
  },
  {
    method: 'POST',
    matcher: /^\/api\/repository\/checkpoints\/[^/]+\/restore$/,
    capability: 'symbolwright.checkpoint.restore',
  },
  { method: 'POST', matcher: /^\/api\/missions$/, capability: 'symbolwright.mission.create' },
  { method: 'GET', matcher: /^\/api\/missions$/, capability: 'symbolwright.mission.read' },
  { method: 'GET', matcher: /^\/api\/missions\/[^/]+$/, capability: 'symbolwright.mission.read' },
  {
    method: 'GET',
    matcher: /^\/api\/missions\/[^/]+\/events$/,
    capability: 'symbolwright.mission.read',
  },
  {
    method: 'PATCH',
    matcher: /^\/api\/missions\/[^/]+$/,
    capability: 'symbolwright.mission.execute',
  },
  {
    method: 'POST',
    matcher: /^\/api\/missions\/[^/]+\/autonomy\/(start|resume|retry)$/,
    capability: 'symbolwright.mission.execute',
  },
  {
    method: 'POST',
    matcher: /^\/api\/missions\/[^/]+\/autonomy\/(pause|cancel)$/,
    capability: 'symbolwright.mission.cancel',
  },
  {
    method: 'GET',
    matcher: /^\/api\/missions\/[^/]+\/autonomy.*$/,
    capability: 'symbolwright.mission.read',
  },
  {
    method: 'POST',
    matcher: /^\/api\/sandbox\/execute$/,
    capability: SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
  },
  // Preliminary route admission only. The handler performs the real policy-version-bound
  // `symbolwright.dependencies.acquire` authorization after resolving the mission and policy.
  {
    method: 'POST',
    matcher: /^\/api\/sandbox\/dependencies\/npm$/,
    capability: 'symbolwright.mission.read',
  },
  // Preliminary route admission only. The handler resolves mission ownership and performs the
  // policy-version-bound `symbolwright.sandbox.egress` authorization before network work begins.
  {
    method: 'POST',
    matcher: /^\/api\/sandbox\/egress$/,
    capability: 'symbolwright.mission.read',
  },
  { method: 'GET', matcher: /^\/api\/sandbox.*$/, capability: SANDBOX_OFFLINE_EXECUTE_CAPABILITY },
  {
    method: 'POST',
    matcher: /^\/api\/github\/intake$/,
    capability: 'symbolwright.repository.index',
  },
  // Deliberately the *read* capability, not `symbolwright.mission.execute` — this route-level
  // check only gates "may this agent talk to the agent loop at all." Whether a specific turn may
  // mutate anything is enforced per tool call inside the loop (`authorized-tool-execution.ts`),
  // where the granular tool capability (and its own approval policy) applies.
  { method: 'POST', matcher: /^\/api\/agent$/, capability: 'symbolwright.mission.read' },
  { method: 'GET', matcher: /^\/api\/tools$/, capability: 'symbolwright.repository.analyze' },
  { method: 'GET', matcher: /^\/api\/memory\/.*$/, capability: 'symbolwright.repository.search' },
  {
    method: 'GET',
    matcher: /^\/api\/checkpoints.*$/,
    capability: 'symbolwright.checkpoint.create',
  },
  { method: 'GET', matcher: /^\/api\/local-status$/, capability: 'repo.metadata.read' },
]

export function resolveRouteCapability(method: string, pathname: string): string | undefined {
  return RULES.find((rule) => rule.method === method && rule.matcher.test(pathname))?.capability
}
