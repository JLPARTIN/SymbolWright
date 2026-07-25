# CodeMind - Ajna Roadmap

**Capability name:** CodeMind - Ajna  
**Internal label:** `CODEMIND_AJNA_REVIEW_CORTEX`  
**Preferred display name:** Ajna Review Cortex  
**Primary tagline:** See beyond the code.  
**GitHub / PR subtitle:** Expand your vision beyond the diff.  
**Purpose:** Define Ajna as CodeMind's third-eye PR insight and merge-readiness capability.

---

## 1. Identity

Ajna is a native CodeMind capability, not a separate agent and not the whole CodeMind product.

Ajna acts as CodeMind's review intelligence layer: the third eye that sees hidden risks across diffs, tests, architecture, security posture, dependency changes, and repository history before code is merged.

CodeMind plans, writes, repairs, validates, and prepares code.

Ajna reviews, investigates, compares, and warns.

Together they form the core coding-agent loop:

```txt
CodeMind builds and repairs.
Ajna sees deeper before merge.
```

---

## 2. Positioning

Ajna should feel universal, enlightened, spiritual, and mind-expanding without weakening its developer utility.

Primary positioning:

```txt
See beyond the code.
```

GitHub / PR review subtitle:

```txt
Expand your vision beyond the diff.
```

Tactical developer-facing optional line:

```txt
See the bug before it ships.
```

---

## 3. What Ajna Does

Ajna should analyze pull requests and codebase changes beyond the visible changed lines.

Core responsibilities:

```txt
diff review
hidden risk detection
architecture drift detection
test impact analysis
CI signal interpretation
security-sensitive path review
dependency change review
API contract change review
merge-readiness classification
review summary generation
operator next-step recommendation
```

---

## 4. What Ajna Is Not

Ajna is not:

```txt
the whole CodeMind platform
a code writer by itself
a merge authority
a CI bypass
a replacement for operator review
a secret reader
a permission override system
an autonomous production mutator
```

Ajna may recommend, warn, and classify. It may not self-authorize writes or merges.

---

## 5. Review Phases

```txt
AJNA-1: Identity, roadmap, build plan, and governance docs
AJNA-2: Review contract and TypeScript output schema
AJNA-3: Diff + file impact scanner
AJNA-4: Risk classifier
AJNA-5: Merge-readiness engine
AJNA-6: CI/test evidence adapter
AJNA-7: GitHub PR review draft renderer
AJNA-8: Architecture drift detector
AJNA-9: Security-sensitive path detector
AJNA-10: CodeMind write/repair feedback loop
AJNA-11: AELIB external adapter contract
```

---

## 6. Merge-Readiness Categories

Ajna should eventually classify PRs into clear review states:

```txt
READY_TO_REVIEW
NEEDS_TEST_EVIDENCE
NEEDS_OPERATOR_DECISION
BLOCKED_BY_RISK
BLOCKED_BY_CI
BLOCKED_BY_SECURITY
BLOCKED_BY_ARCHITECTURE_DRIFT
MERGE_READY_WITH_EVIDENCE
```

Ajna must not return `MERGE_READY_WITH_EVIDENCE` unless the configured evidence gates are satisfied.

---

## 7. Evidence Ladder

Ajna findings should identify evidence quality:

```txt
DIRECT_DIFF_EVIDENCE
DIRECT_TEST_EVIDENCE
DIRECT_CI_EVIDENCE
REPO_CONTEXT_EVIDENCE
HISTORICAL_PATTERN_EVIDENCE
INFERRED_RISK
UNVERIFIED_HYPOTHESIS
UNKNOWN
```

---

## 8. CodeMind Interaction

Ajna should feed CodeMind with review intelligence.

Example loop:

```txt
operator asks CodeMind to fix a bug
  ↓
CodeMind scans and plans
  ↓
CodeMind proposes or applies approved patch
  ↓
Ajna reviews the patch/PR
  ↓
Ajna flags hidden risks
  ↓
CodeMind repairs or adds tests
  ↓
Ajna reassesses merge-readiness
```

---

## 9. AELIB Integration Direction

AELIB-X1YA0I should not contain the full Ajna runtime.

Future AELIB integration should be thin:

```txt
AELIB operator request
  ↓
AELIB governed external capability adapter
  ↓
CodeMind / Ajna review call
  ↓
AELIB receives review summary and evidence metadata
```

AELIB remains the synthetic brain. CodeMind remains the coding-agent platform. Ajna remains CodeMind's review cortex.

---

## 10. Final Rule

Ajna must help CodeMind see what ordinary diff review misses, while preserving operator approval, evidence discipline, and merge safety.