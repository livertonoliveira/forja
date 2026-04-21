# SemVer Policy — Forja

## Commitment

Forja follows [Semantic Versioning 2.0.0](https://semver.org/). Starting at **v1.0.0**, changes to the public surface listed below follow strict SemVer guarantees:

- **PATCH** (`x.y.Z`): backwards-compatible bug fixes only
- **MINOR** (`x.Y.0`): backwards-compatible new functionality
- **MAJOR** (`X.0.0`): incompatible API changes

**Pre-1.0.0 notice:** Until v1.0.0 is released (current: `0.1.3`), minor versions (`0.X.0`) **may introduce breaking changes**. Build with caution.

---

## Public Surface

The items below are explicitly covered by SemVer guarantees starting at v1.0.0.

### CLI Flags

Defined in [`src/cli/commands/`](src/cli/commands/).

| Command | Argument / Flag | Type | Default | Since |
|---------|----------------|------|---------|-------|
| `run` | `<issue-id>` | positional | — | 0.1.0 |
| `run` | `--model <model>` | string | — | 0.1.0 |
| `run` | `--dry-run` | boolean | false | 0.1.0 |
| `run` | `--force` | boolean | false | 0.1.0 |
| `run` | `--force-phase <phase>` | string | — | 0.1.0 |
| `run` | `--timeout-phase <phase:seconds>` | string | — | 0.1.0 |
| `gate` | `--run <run-id>` | UUID string | — (required) | 0.1.0 |
| `gate` | `--policy <path>` | string | `policies/default.yaml` | 0.1.0 |
| `trace` | `--run <run-id>` | UUID string | — | 0.1.0 |
| `trace` | `--format <format>` | `md\|json\|pretty` | `pretty` | 0.1.0 |
| `trace` | `--output <file>` | string | — | 0.1.0 |
| `cost` | `--run <run-id>` | UUID string | — | 0.1.0 |
| `resume` | `<run-id>` | positional (UUID) | — | 0.1.0 |
| `prune` | `--before <date>` | ISO date string | — | 0.1.0 |
| `prune` | `--dry-run` | boolean | false | 0.1.0 |
| `replay` | `<run-id>` | positional (UUID) | — | 0.1.0 |
| `replay` | `--compare <run-id>` | UUID string | — | 0.1.0 |
| `replay` | `--phases <phases>` | comma-separated list | — | 0.1.0 |
| `ui` | `--port <port>` | number | `4242` | 0.1.0 |
| `infra` | `<action>` | `up\|down\|status` | — | 0.1.0 |
| `config` | `<action>` | `get\|set` | — | 0.1.0 |
| `config` | `[key]` | `store_url\|slack_webhook_url\|github_token` | — | 0.1.0 |
| `hook` | `<event-type>` | `pre-tool-use\|post-tool-use\|stop` | — | 0.1.0 |
| `schedule` | `<command>` | `list\|delete\|<cmd-to-schedule>` | — | 0.1.0 |
| `schedule` | `[id]` | string | — | 0.1.0 |
| `schedule` | `--cron <expr>` | cron expression | — | 0.1.0 |
| `setup` | `--with-harness` | boolean | false | 0.1.0 |
| `setup` | `--skip-claude-md` | boolean | false | 0.1.0 |

**Stable exit codes for `gate`:** `0` = pass, `1` = warn (medium findings), `2` = fail (critical or high findings).

### Zod Schemas

All schemas re-exported from [`src/schemas/index.ts`](src/schemas/index.ts). TypeScript types are exported alongside each schema.

| Schema | File | Key Fields | Since |
|--------|------|-----------|-------|
| [`ConfigSchema`](src/schemas/config.ts#L13) | `src/schemas/config.ts` | `storeUrl`, `retentionDays`, `phasesDir`, `logLevel`, `teamId`, `linearToken`, `timeouts` | 0.1.0 |
| [`PhaseTimeoutsSchema`](src/schemas/config.ts#L3) | `src/schemas/config.ts` | `dev`, `test`, `perf`, `security`, `review`, `homolog`, `pr` | 0.1.0 |
| [`FindingSchema`](src/schemas/finding.ts#L3) | `src/schemas/finding.ts` | `id`, `runId`, `phaseId`, `agentId`?, `severity`, `category`, `filePath`?, `line`?, `title`, `description`, `suggestion`?, `owasp`?, `cwe`?, `createdAt` | 0.1.0 |
| [`GateDecisionSchema`](src/schemas/gate.ts#L3) | `src/schemas/gate.ts` | `id`, `runId`, `phaseId`?, `decision`, `criticalCount`, `highCount`, `mediumCount`, `lowCount`, `policyApplied`, `decidedAt` | 0.1.0 |
| [`CostEventSchema`](src/schemas/cost.ts#L3) | `src/schemas/cost.ts` | `id`, `runId`, `phaseId`, `agentId`, `spanId`?, `model`, `tokensIn`, `tokensOut`, `cacheCreationTokens`, `cacheReadTokens`, `costUsd`, `createdAt` | 0.1.0 |
| [`RunStateEnum`](src/schemas/run.ts#L3) | `src/schemas/run.ts` | `init\|spec\|dev\|test\|perf\|security\|review\|homolog\|pr\|done\|failed` | 0.1.0 |
| [`TraceEventSchema`](src/schemas/trace.ts#L3) | `src/schemas/trace.ts` | `ts`, `runId`, `phaseId`?, `agentId`?, `spanId`?, `eventType`, `commandFingerprint`?, `payload` | 0.1.0 |

Exported TypeScript types: `Config`, `PhaseTimeouts`, `Finding`, `GateDecision`, `CostEvent`, `RunState`, `TraceEvent`.

### Policy YAML Format

Three YAML policy formats are part of the public surface. All use `version: "1"` as the current schema version.

#### Gate Policy (`policies/default.yaml`)

Canonical definition: [`policies/default.yaml`](policies/default.yaml).

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `version` | `"1"` | yes | Schema version — must be `"1"` |
| `timeouts` | object | no | Phase timeout overrides (seconds per phase) |
| `timeouts.<phase>` | number | no | Phases: `dev`, `test`, `perf`, `security`, `review`, `homolog`, `pr` |
| `policies` | array | yes | Ordered list of gate rules |
| `policies[].name` | string | yes | Unique rule identifier |
| `policies[].when` | object | yes | Condition: `finding.<field>: <value>` |
| `policies[].then` | array | yes | Actions to execute when condition matches |
| `policies[].then[].action` | string | yes | One of: `fail_gate`, `warn_gate`, `pass_gate`, `log`, `notify_slack`, `http_post` |

#### Models Policy (`policies/models.yaml`)

Canonical definition: [`policies/models.yaml`](policies/models.yaml).

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `version` | `"1"` | yes | Schema version |
| `phases` | object | yes | Map of phase name → model ID string |
| `phases.<phase>` | string | yes | Phases: `spec`, `develop`, `test`, `perf`, `security`, `review`, `homolog`, `pr`, `audit_backend`, `audit_frontend`, `audit_security`, `audit_database` |

#### Tools Policy (`policies/tools.yaml`)

Canonical definition: [`policies/tools.yaml`](policies/tools.yaml).

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `version` | `"1"` | yes | Schema version |
| `phases` | object | yes | Map of phase name → tool restriction object |
| `phases.<phase>.deny` | string[] | no | Tool names denied in this phase |
| `phases.<phase>.allow` | string[] or `"*"` | no | Tool names allowed (or `"*"` for unrestricted) |

### Gate DSL

The 8 canonical predicates below are part of the public DSL surface starting at v1.0.0.
Defined in [`src/policy/dsl/predicates.ts`](src/policy/dsl/predicates.ts) and exported via `PREDICATES_REGISTRY`.

| Predicate | Signature | Return | Since |
|-----------|-----------|--------|-------|
| `coverage.delta` | `coverage.delta()` | `number` | 0.1.4 |
| `coverage.absolute` | `coverage.absolute()` | `number` | 0.1.4 |
| `diff.filesChanged` | `diff.filesChanged()` | `number` | 0.1.4 |
| `diff.linesChanged` | `diff.linesChanged()` | `number` | 0.1.4 |
| `touched.matches` | `touched.matches(glob: string)` | `boolean` | 0.1.4 |
| `time.phaseDurationMs` | `time.phaseDurationMs(phase: string)` | `number` | 0.1.4 |
| `cost.usd` | `cost.usd()` | `number` | 0.1.4 |
| `findings.countBySeverity` | `findings.countBySeverity(severity: string)` | `number` | 0.1.4 |

**SemVer rules for predicates:**
- Adding a new predicate → MINOR bump
- Renaming or removing a predicate → MAJOR bump
- Changing predicate semantics → MAJOR bump

### Plugin API

The Plugin API is exported from the `@forja-hq/cli/plugin` subpath. It provides the stable interfaces for building Forja plugins.

**Subpath:** `@forja-hq/cli/plugin` → `dist/plugin/index.js` / `dist/plugin/index.d.ts`

| Type | Kind | Description | Since |
|------|------|-------------|-------|
| `Command` | interface | Defines a custom command with `id`, `description`, optional `labels`, and a `run` method | 0.1.3 |
| `CommandContext` | interface | Context passed to `Command.run` — provides `cwd`, `config`, `store`, and `logger` | 0.1.3 |
| `CommandResult` | interface | Return value of `Command.run` — `exitCode` and optional `summary` | 0.1.3 |
| `Phase` | interface | Defines a pipeline phase with `id`, optional `insertAfter` and `timeoutMs`, and a `run` method | 0.1.3 |
| `PhaseContext` | interface | Context passed to `Phase.run` — provides `runId`, `previousPhases`, `store`, and `abortSignal` | 0.1.3 |
| `PhaseResult` | interface | Return value of `Phase.run` — `status` (`pass` \| `warn` \| `fail`) and optional `outputs` | 0.1.3 |

All types are self-contained and carry no dependency on internal Forja classes. The `store` field in both `CommandContext` and `PhaseContext` uses a minimal structural type — any object with matching `get`/`set` signatures is compatible.

### Audit JSON Schema

> **Placeholder** — The canonical JSON schema for audit output will be defined in REQ-09. Until then, [`FindingSchema`](src/schemas/finding.ts#L3) is the runtime contract for individual findings.

### `forja/config.md` Format

The `forja/config.md` file in each consumer project is the source of truth for project context. Forja commands read this file to adapt their behavior.

| Section | Required | Mandatory Fields | Optional Fields |
|---------|----------|-----------------|----------------|
| `## Project` | yes | `Name`, `Type`, `Language` (human label), `Runtime` | — |
| `## Stack` | yes | `Language` (toolchain detail), `Runtime` | `Build`, `Dev runner`, `Database`, `Test framework`, `Lint`, `Typecheck`, `Package manager` |
| `## Linear Integration` | yes | `Configured` (`yes`/`no`) | `Team`, `Team ID` (required when `Configured: yes`) |
| `## Conventions` | no | — | `Artifacts language`, `Code language`, `Commit style`, `Branch naming`, `Atomic commits`, `Co-author` |

> Note: `Language` appears in both `## Project` (a human-readable label, e.g., `TypeScript`) and `## Stack` (the toolchain entry with version/runtime details). Both must be present and consistent.

---

## Internal Surface (no guarantee)

The following are **implementation details** and carry **no SemVer guarantees**. They may change, be renamed, or be removed in any release:

- **TypeScript symbols** exported from the main entry point (`@forja-hq/cli`) that are not explicitly listed in the Public Surface section above.
- **PostgreSQL table schema** — all tables in `src/store/drizzle/schema.ts` are internal storage details. Access run data exclusively via the `ForjaStore` interface.
- **Checkpoint format** — binary checkpoint files at `~/.forja/runs/<run-id>/checkpoints/` may change without notice.
- **JSONL trace structure** — files at `~/.forja/runs/<run-id>/trace.jsonl`. Parse only via `forja trace` or the official reader; direct parsing is unsupported.
- **`~/.forja/config.json`** — runtime configuration file managed by `forja config set`. Internal schema may change.
- **`docker-compose.forja.yml`** — copied by `forja setup --with-harness`. Contents are not versioned.
- **Slash command files** — `.claude/commands/forja/` files installed by `forja setup`. They are internal implementation and may change in any release.

---

## Artifact Version Table

Each public artifact type will expose a `schemaVersion` field once REQ-20 is implemented. Until then, all artifacts are at schemaVersion `0` (pre-stable).

| Artifact | Current schemaVersion | Notes |
|----------|----------------------|-------|
| `FindingSchema` | `0` | To be stamped in REQ-20 |
| `GateDecisionSchema` | `0` | To be stamped in REQ-20 |
| `CostEventSchema` | `0` | To be stamped in REQ-20 |
| `TraceEventSchema` | `0` | To be stamped in REQ-20 |
| `RunStateEnum` | `0` | To be stamped in REQ-20 |
| Gate Policy YAML | `version: "1"` | Stable since 0.1.0 |
| Models Policy YAML | `version: "1"` | Stable since 0.1.0 |
| Tools Policy YAML | `version: "1"` | Stable since 0.1.0 |

---

## Review Process

Any change to `SEMVER.md` — additions, removals, or scope changes to the public surface — **requires**:

1. **RFC (Request for Comments)** — open a Linear issue describing the proposed change, its rationale, and the migration path for consumers.
2. **CODEOWNERS approval** — at least one maintainer listed in `.github/CODEOWNERS` must approve the PR before merge. A `CODEOWNERS` file must be created before v1.0.0.
3. **Changelog entry** — the change must be recorded in `CHANGELOG.md` under the appropriate version (once REQ-17 is implemented).

> Rationale: `SEMVER.md` is the source of truth for what Forja promises to consumers. Unreviewed changes risk silently breaking integrations built on documented guarantees.
