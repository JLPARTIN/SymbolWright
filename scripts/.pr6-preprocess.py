from pathlib import Path
import re

path = Path('scripts/.pr6-apply.py')
text = path.read_text()
old = '''replace_once(
    'src/orchestration/orchestration-types.ts',
    "import type { ApprovalPolicy, PrincipalType, RepositoryScope } from '../access/access-types.js'",
    "import {\\n  parseMicrodollars,\\n  serializeMicrodollars,\\n  usdToMicrodollars,\\n} from '../access/microdollars.js'\\nimport type { ApprovalPolicy, PrincipalType, RepositoryScope } from '../access/access-types.js'",
)'''
new = '''replace_once(
    'src/orchestration/orchestration-types.ts',
    " */\\n\\nexport const AGENT_PROVIDER_KINDS",
    " */\\n\\nimport {\\n  parseMicrodollars,\\n  serializeMicrodollars,\\n  usdToMicrodollars,\\n} from '../access/microdollars.js'\\n\\nexport const AGENT_PROVIDER_KINDS",
)'''
if old not in text:
    raise SystemExit('PR 6 generator import-anchor block missing')
text = text.replace(old, new, 1)

docker_block = '''# Docker image must give the non-root process a real writable state root.
replace_once(
    'Dockerfile',
    """COPY --from=build /app/dist/ ./dist/

RUN addgroup -S symbolwright && adduser -S symbolwright -G symbolwright
USER symbolwright

ENTRYPOINT [\"node\", \"dist/cli.js\"]
""",
    """COPY --from=build /app/dist/ ./dist/

RUN addgroup -S symbolwright \\
  && adduser -S symbolwright -G symbolwright \\
  && mkdir -p /data \\
  && chown symbolwright:symbolwright /data
USER symbolwright
WORKDIR /data
EXPOSE 8787
VOLUME [\"/data\"]

ENTRYPOINT [\"node\", \"/app/dist/cli.js\"]
""",
)

'''
text, count = re.subn(
    r"# Docker image must give the non-root process a real writable state root\..*?# Package scripts and native node:test coverage for release tooling\.",
    lambda _match: docker_block + '# Package scripts and native node:test coverage for release tooling.',
    text,
    count=1,
    flags=re.DOTALL,
)
if count != 1:
    raise SystemExit(f'Expected one Docker generator block, replaced {count}')

workflow_block = '''# Workflows: immutable verification, strict smoke, exact pushed digest validation.
replace_once(
    '.github/workflows/publish.yml',
    """      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
""",
    """      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.event.release.tag_name || github.ref_name }}
""",
)
replace_once(
    '.github/workflows/publish.yml',
    """      - name: Validate release proof
        run: npm run validate
""",
    """      - name: Verify immutable tag inputs
        run: npm run release:verify-tag -- \"${GITHUB_REF_NAME}\"

      - name: Validate release proof
        env:
          SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE: '1'
        run: npm run validate
""",
)
replace_once(
    '.github/workflows/deploy.yml',
    """      - name: Validate release proof
        run: npm run validate
""",
    """      - name: Validate release proof
        env:
          SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE: '1'
        run: npm run validate
""",
)
replace_once(
    '.github/workflows/deploy.yml',
    """      - name: Build and push image
        uses: docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a # v7.3.0
""",
    """      - name: Build and push image
        id: build
        uses: docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a # v7.3.0
""",
)
replace_once(
    '.github/workflows/deploy.yml',
    """          cache-to: type=gha,mode=max
""",
    """          cache-to: type=gha,mode=max

      - name: Pull and smoke-test the exact pushed digest
        env:
          SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE: '1'
        run: |
          image=\"${{ env.REGISTRY }}/${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}\"
          docker pull \"$image\"
          npm run release:docker-smoke -- --image \"$image\"
""",
)

'''
text, count = re.subn(
    r"# Workflows: immutable verification, strict smoke, exact pushed digest validation\..*?# Focused changelog entry only\.",
    lambda _match: workflow_block + '# Focused changelog entry only.',
    text,
    count=1,
    flags=re.DOTALL,
)
if count != 1:
    raise SystemExit(f'Expected one workflow generator block, replaced {count}')

# Align generated autonomy tests with the repository's real public types.
text = text.replace("principalType: 'service', displayName: 'Budgeted'", "principalType: 'service-account', displayName: 'Budgeted'", 1)
text = text.replace(
    """    const mission = missionService.create({
      name: 'Budget stop', objective: 'Do no provider work', repositoryRoot: workspaceRoot,
      runtimeMode: 'APPROVED_EXECUTION', grantId: grant.id,
    })
""",
    """    const mission = await missionService.create(
      {
        name: 'Budget stop',
        objective: 'Do no provider work',
        repositoryPath: workspaceRoot,
        runtimeMode: 'APPROVED_EXECUTION',
      },
      { grantId: grant.id },
    )
""",
    1,
)
text = text.replace(
    "taskExecutor: { async execute() { calls += 1; return { status: 'completed', summary: 'done' } } },",
    "taskExecutor: { async execute() { calls += 1; return { state: 'completed' } } },",
    1,
)
text = text.replace(
    """    expect(result.execution.status).toBe('cancelled')
    expect(result.execution.cancellationReason).toBe('budget')
""",
    """    expect(result.execution.graph.tasks.every((task) => task.state === 'failed')).toBe(true)
    expect(result.execution.completedAt).toBeDefined()
    expect(result.execution.cancellationReason).toBe('budget')
""",
    1,
)

# Preserve narrowing across the returned budget predicate closure.
text = text.replace(
    """  #budgetExceededPredicate(
    mission: SymbolWrightMission,
  ): (() => boolean) | undefined {
    if (
      mission.grantId === undefined ||
      this.#accessRuntime === undefined ||
      this.#getGovernanceStore === undefined
    ) {
      return undefined
    }
    const capUsd = this.#accessRuntime.grantService.getGrant(mission.grantId)?.executionLimits
      .maxDailyEstimatedCostUsd
    if (capUsd === undefined) return undefined
    const cap = usdToMicrodollars(capUsd)
    return () =>
      this.#getGovernanceStore?.().getGrantDailyUsageMicrodollars(mission.grantId as string) >= cap
  }
""",
    """  #budgetExceededPredicate(
    mission: SymbolWrightMission,
  ): (() => boolean) | undefined {
    const grantId = mission.grantId
    const getGovernanceStore = this.#getGovernanceStore
    if (grantId === undefined || this.#accessRuntime === undefined || getGovernanceStore === undefined) {
      return undefined
    }
    const capUsd = this.#accessRuntime.grantService.getGrant(grantId)?.executionLimits
      .maxDailyEstimatedCostUsd
    if (capUsd === undefined) return undefined
    const cap = usdToMicrodollars(capUsd)
    return () => getGovernanceStore().getGrantDailyUsageMicrodollars(grantId) >= cap
  }
""",
    1,
)

path.write_text(text)
