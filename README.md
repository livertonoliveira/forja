<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Slash_Commands-7C3AED?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTcgMTRsNS01IDUgNSIvPjwvc3ZnPg==" alt="Claude Code">
  <img src="https://img.shields.io/badge/Stack-Agnostic-10B981?style=for-the-badge" alt="Stack Agnostic">
  <img src="https://img.shields.io/badge/License-BUSL--1.1-blue?style=for-the-badge" alt="BUSL-1.1 License">
  <img src="https://img.shields.io/badge/Linear-Integration-5E6AD2?style=for-the-badge&logo=linear&logoColor=white" alt="Linear Integration">
  <img src="https://img.shields.io/badge/npm-%40forja--hq%2Fcli-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm package">
  <img src="https://github.com/livertonoliveira/forja/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

<h1 align="center">Forja</h1>

<p align="center">
  <strong>The automated development pipeline for Claude Code.</strong><br>
  From raw idea to shipped pull request — with quality gates, parallel agents, full observability, and an auditable cost trail for every single tool call.
</p>

<p align="center">
  <a href="#why-forja">Why Forja</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#the-pipeline">The Pipeline</a> ·
  <a href="#harness-engine">Harness Engine</a> ·
  <a href="#slash-commands">Slash Commands</a> ·
  <a href="#cli-reference">CLI</a> ·
  <a href="#dashboard">Dashboard</a> ·
  <a href="#policies">Policies</a> ·
  <a href="#plugins--extensibility">Plugins</a> ·
  <a href="#stability--versioning">Stability</a>
</p>

---

## Why Forja

Claude Code is an incredible hammer. Forja gives you the assembly line.

Shipping a feature the "normal" way with an LLM means juggling a dozen open tabs: requirements, tasks, tests, security review, performance analysis, PR description, Linear updates, commit discipline. Each one eats context. Each one is one prompt away from being forgotten. And when a session crashes mid-way, you start from zero.

Forja replaces that chaos with a **deterministic, auditable pipeline** that runs on Claude Code:

- **One command specifies a whole feature.** `/forja:spec "add password reset"` becomes a Linear project with milestones, labels, and granular tasks — each sized to fit cleanly in a single Claude run.
- **One command ships a single task.** `/forja:run TASK-ID` runs develop → test → performance → security → review → acceptance, with **3+ agents in parallel** and a hard quality gate at every phase.
- **One command ships the PR.** `/forja:pr` produces atomic Conventional Commits and a PR with an aggregated quality report.

Behind the scenes, the **Harness Engine** — a TypeScript runtime registered as a Claude Code hook — intercepts every tool call, persists it to PostgreSQL, computes cost in USD per phase, enforces policy-based quality gates, and exposes a Next.js dashboard so you can see (and replay) everything that happened.

### What you actually get

| | Without Forja | With Forja |
|---|---|---|
| Feature planning | Freeform chat | Linear project with granular tasks (<400 lines each) |
| Code quality | "Please review this" | 3 parallel agents: performance + security + SOLID/DRY/KISS |
| Test coverage | Ad-hoc | Unit + integration + e2e generated in parallel |
| Security posture | Eyeballed | OWASP Top 10 scan on every diff, policy-gated |
| Cost visibility | None | USD per phase, per model, per tool call |
| Session crash | Start over | `forja resume <run-id>` picks up at the last checkpoint |
| Quality gate | LLM opinion | Gate DSL with 8 typed predicates + persisted justification; `0=pass 1=warn 2=fail` exit codes |
| Audit trail | Chat log | Full PostgreSQL trace + signed GitHub Check |
| Commit discipline | "Initial commit" × 20 | Atomic Conventional Commits by design |
| Stack coverage | Manual setup per repo | Auto-detects Node / Python / Go / Rust / Java / Ruby / PHP / .NET |
| Extensibility | Fork the prompts | Typed Plugin API: custom commands, phases, audit modules, policy actions |
| Public-API stability | Vibes | `SEMVER.md`, `DEPRECATIONS.md`, breaking-change CI, signed upgrade guides |
| Artifact compatibility | "Works on my machine" | `schemaVersion` on every Zod schema, JSONL header, report front-matter, and Postgres row — `forja migrate` for upgrades |

---

## Quick Start

```bash
# 1. Install the CLI globally
npm install -g @forja-hq/cli

# 2. Bootstrap Forja in your repo
forja setup                 # slash commands + hooks only
# or
forja setup --with-harness  # also spins up PostgreSQL via Docker

# 3. Open Claude Code in your project and run:
/forja:init                 # auto-detects your stack
/forja:spec "add password reset via email"
/forja:run <task-id>
/forja:pr
```

That's the whole loop: specify → run → ship.

---

## Installation

Forja has two layers and you can adopt either in isolation.

### Layer 1 — Slash commands only (lightweight, zero infra)

```bash
npm install -g @forja-hq/cli
forja setup
```

`forja setup` does three things:

1. Copies the `/forja:*` slash commands to `.claude/commands/forja/`
2. Configures the `PreToolUse`, `PostToolUse`, and `Stop` hooks in `.claude/settings.json`
3. Appends the Forja section to your `CLAUDE.md`

The pipeline runs immediately, with state stored in Linear issues or local markdown files. **No database, no Docker, no config required.**

### Layer 2 — Harness Engine (persistent state, cost tracking, observability)

You have three ways to connect a PostgreSQL database.

#### Option A — Local Postgres via Docker (zero configuration)

```bash
forja setup --with-harness
```

This copies `docker-compose.forja.yml` to your project, spins up PostgreSQL 16, waits for the health check, and runs the migrations. Uses the default DSN `postgresql://forja:forja@localhost:5432/forja`. Requires Docker.

#### Option B — Remote / managed Postgres (recommended for teams)

If you already have a PostgreSQL instance (RDS, Neon, Supabase, a shared team DB), point Forja at it:

```bash
# Persist the connection string in ~/.forja/config.json (user-level)
forja config set store_url postgresql://user:password@host:5432/forja

# Then run only the migrations — no Docker needed
forja infra migrate
```

#### Option C — Environment variable (CI/CD, ephemeral shells)

```bash
export FORJA_STORE_URL=postgresql://user:password@host:5432/forja
forja infra migrate
```

#### Configuration priority

Forja resolves the store URL in this order, first match wins:

1. `FORJA_STORE_URL` environment variable
2. `forja/.forja-config.json` (project-level — commit it if the team shares the same DB)
3. `~/.forja/config.json` (user-level — personal machine defaults)
4. Default: `postgresql://forja:forja@localhost:5432/forja` (Docker compose convention)

#### Optional integrations

```bash
# GitHub Checks API — posts a signed check-run on every pipeline finish
forja config set github_token ghp_...
# or: export GITHUB_TOKEN=ghp_...

# Slack — notify on critical findings via incoming webhook
forja config set slack_webhook_url https://hooks.slack.com/services/...
# or: export FORJA_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Updating

```bash
npm update -g @forja-hq/cli
forja setup   # re-copies updated slash commands (hooks already in place)
```

### Verification

```bash
forja config get store_url     # verify which DSN is active and its source
forja infra status             # check DB connection and migration state
forja plugins list             # list all installed plugins with version and type
```

Then open Claude Code and run `/forja:init`. If it detects your stack and creates `forja/config.md`, you're live.

---

## The Pipeline

### 1. `/forja:spec` — from idea to decomposed plan

```
/forja:spec "feature description"   (or a Linear issue ID)
│
├─► 2 parallel agents  (Linear fetch  +  codebase map)
│
└─► user reviews the plan
    │
    └─► OUTPUT
        ├── proposal.md  +  design.md  (or Linear Documents)
        └── Linear project
            ├── Milestone 1
            │   ├── Task A  (~150 lines)
            │   └── Task B  (~200 lines)
            └── Milestone 2
                ├── Task C  (~120 lines)
                └── Task D  (~180 lines)
```

### 2. `/forja:run TASK-ID` — from task to accepted code

```
/forja:run TASK-ID
│
├─► DEVELOP            N parallel agents, one per independent module
│
├─► TEST               3 parallel agents: unit + integration + e2e
│
├─► QUALITY PHASES     3 parallel gates, one pass:
│   ├── PERFORMANCE    2 agents  (diff-scoped)
│   ├── SECURITY       3 agents  (OWASP on diff)
│   └── REVIEW         N agents  (SOLID / DRY / KISS)
│
├─► GATE CHECK
│   ├── fail   →  fix and re-run
│   ├── warn   →  ask user
│   └── pass   →  continue
│
└─► ACCEPT             you approve
    │
    └─► /forja:pr      atomic Conventional Commits + PR with report
```

### Quality gates

Every quality phase emits findings with a severity. The policy evaluator maps severity to a gate decision:

| Severity | Gate | Behavior |
|----------|------|----------|
| `critical` / `high` | **FAIL** | Pipeline stops. Findings become Linear sub-issues. User must fix or override. |
| `medium` | **WARN** | Pipeline pauses. User decides: fix now or proceed. |
| `low` / none | **PASS** | Pipeline continues automatically. |

Gate decisions are stored in the `gate_decisions` table and surfaced via `forja gate --run <id>` with standard Unix exit codes: `0=pass 1=warn 2=fail`. Drop that in your CI and you have a deterministic quality gate.

### Dual storage (Linear or local)

| | With Linear MCP | Standalone |
|---|---|---|
| Proposal & Design | Linear Documents | `forja/changes/<feature>/proposal.md` + `design.md` |
| Tasks | Linear Issues (with milestones + labels) | `forja/changes/<feature>/tasks.md` |
| Quality reports | Comments on issues | `forja/changes/<feature>/report-*.md` |
| Tracking | Linear sub-issues | `forja/changes/<feature>/tracking.md` |
| Local footprint | Just `forja/config.md` | Full `forja/` workspace |

Either way, **all context survives a crashed session**.

---

## Harness Engine

The Harness is what turns Forja from a set of prompts into a real, observable runtime.

### How it plugs into Claude Code

The `forja` binary registers itself as a [Claude Code hook](https://docs.anthropic.com/en/docs/claude-code/hooks) in `.claude/settings.json`. Every tool call round-trips through it:

```
Claude Code wants to call a tool
  │
  ▼
forja hook pre-tool-use
  ├─ receives {tool_name, tool_input} via stdin
  ├─ enforces tools policy (e.g. security phase can't Write or Bash)
  ├─ validates model assignment (e.g. spec must use Opus)
  ├─ redacts secrets in the payload (sk-*, ghp_*, high-entropy strings)
  └─ can BLOCK the tool with exit code 2
  │
  ▼
Claude executes the tool
  │
  ▼
forja hook post-tool-use
  ├─ reads tokens in / out from the response
  ├─ computes USD cost per model (Opus 15/75, Sonnet 3/15, Haiku 0.8/4 per 1M)
  ├─ records duration, tool name, span ID, agent ID
  └─ writes a cost_event + tool_call row to PostgreSQL
  │
  ▼
Claude stops
  │
  ▼
forja hook stop
  ├─ detects phase timeouts
  ├─ transitions the FSM (dev → test → perf → ...)
  ├─ finalizes run status and writes the consolidated trace
  └─ triggers actions: GitHub Check, Slack notification, webhooks
```

Net effect: **every tool call is an immutable row in your database**, tagged to a run, phase, agent, and cost. You can replay any run, detect regressions, bill your cost center, or prove what happened during an incident.

### Finite State Machine

A pipeline run walks through an explicit FSM with row-level locks to prevent concurrent transitions:

```
happy path:
  init  →  spec  →  dev  →  test  →  perf  →  security  →  review  →  homolog  →  pr  →  done

failure path:
  perf | security | review   →   failed   →   dev   (retry from dev)
```

Invalid transitions are rejected at the database level — you literally can't skip security because the FSM won't let you.

### Checkpoints & resumability

Every phase writes a checkpoint on completion. If Claude crashes, times out, or a human Ctrl+C's the session:

```bash
forja resume <run-id>   # picks up at the last successful phase
```

Combined with `idempotency.ts`, re-running an already-completed phase is a no-op unless you pass `--force` or `--force-phase dev`.

### Replay & regression detection

```bash
forja replay <run-id>
```

Re-executes a previous run with identical inputs, then **diffs the outcomes**: added findings (new bugs), removed findings (fixed or false positives), gate flips. Command files are fingerprinted (SHA-256 of the phase prompt) so you can tell whether a regression came from a code change or from a prompt change — no more "it worked yesterday" mysteries.

### Cost tracking

```bash
forja cost --run <run-id>
```

Breakdown by phase and by model, in USD, with token counts. The accumulator runs inside `post-tool-use`, so cost is computed **as it happens** — you can kill a runaway pipeline mid-flight.

Pricing table (per 1M tokens, in / out):
- Opus 4.x — `$15 / $75`
- Sonnet 4.x — `$3 / $15`
- Haiku 4.x — `$0.80 / $4`

### Secret redaction

Outbound hook payloads are scanned with:
- Pattern-based regex for known prefixes (`sk-ant-*`, `ghp_*`, AWS keys, bearer tokens)
- Shannon-entropy heuristics for unknown high-entropy strings

Matches are replaced with `[REDACTED]` before anything is written to traces, database, or Slack. Your tokens don't end up in your observability stack.

### GitHub Checks

When a pipeline completes, Forja parses your git remote, extracts `owner/repo`, and posts a signed check-run at the current SHA via the GitHub Checks API. Your PR sees a native ✅/❌ next to the commit — no GitHub Actions setup needed.

### Slack notifications

Policy actions can fire Slack webhooks with templated messages:

```yaml
actions:
  on_critical:
    - kind: notify_slack
      channel: "#eng-alerts"
      text: "🚨 Critical finding in {{runId}}: {{finding.title}}"
```

Only HTTPS webhooks are accepted.

### Observability

- **JSONL traces** at `forja/state/runs/<run-id>/trace.jsonl` — always written, even if the DB is unavailable (dual-write architecture)
- **PostgreSQL** for queryable history
- **Next.js dashboard** (`forja ui`) for humans

### Schema versioning & migrations

Every artifact Forja produces — Zod-validated records, JSONL trace headers, markdown report front-matter, and 7 of the Postgres tables (`runs`, `phases`, `findings`, `gate_decisions`, `tool_calls`, `cost_events`, `issue_links`) — carries a `schemaVersion` field stamped from `CURRENT_SCHEMA_VERSION` (`src/schemas/versioning.ts`). The current version is `1.0`, set by migration `0004_schema_versioning.sql`.

Upgrading old artifacts is a single-command operation:

```bash
forja migrate trace path/to/trace.jsonl   # in-place upgrade of a JSONL trace
forja migrate report path/to/report.md    # upgrade a markdown report front-matter
forja migrate postgres                    # migrate every row in the configured DB

# All subcommands accept:
#   --dry-run            preview the change without writing
#   --from <version>     explicit source version (default: read from header)
#   --to   <version>     explicit target version (default: CURRENT_SCHEMA_VERSION)
```

The runners (`src/store/migrations/{trace,report,postgres}-runner.ts`) walk a registry of versioned migration steps, applying them sequentially. Forward-compatibility is verified by golden-file roundtrip tests: fixtures in `tests/fixtures/schemas/{pre-1.0,v1.0,hypothetical-1.1}/` exercise pre-1.0 → 1.0 upgrades, current parsing, and forward-version tolerance for unknown fields. CI re-runs the roundtrip suite on every change under `src/schemas/` or `src/store/migrations/`.

Releases that bump a `schemaVersion` ship with an upgrade guide under `docs/upgrades/v<X.Y>.md`, generated from `docs/upgrades/_template.md` and validated by `scripts/validate-upgrade-guide.ts` before tagging — the release script will refuse to publish if any `...` placeholder is left unfilled.

### Retention

```bash
forja prune --older-than 90d   # default retention is 90 days
forja prune --dry-run          # preview impact first
```

Removes rows in batches of 50 and the corresponding `forja/state/runs/<run-id>/` directories, reporting total bytes freed.

### Scheduling

```bash
forja schedule list
forja schedule create --cron "0 2 * * 1" --command "/forja:audit:run"
```

Cron-driven recurring runs. Schedules live in `.forja/schedules.json`; next-run times are computed via `cron-parser`.

### Harness vs slash-only — side by side

| Capability | Slash only | + Harness |
|---|---|---|
| Pipeline state | Linear / markdown | PostgreSQL + FSM |
| Session interruption | Start over | `forja resume <run-id>` |
| Cost tracking | — | USD per phase via `forja cost` |
| Quality gate verdict | LLM decision | Gate DSL evaluator with persisted justification, exit-code enforced |
| Full tool-call history | — | Queryable in PostgreSQL |
| Real-time tool interception | — | Pre/post hooks block disallowed tools |
| Dashboard | — | `forja ui` Next.js app |
| Replay + regression detection | — | `forja replay <run-id>` |
| Scheduled pipelines | — | `forja schedule` |
| GitHub Checks | — | Automatic on run completion |
| Secret redaction | — | Pattern + entropy-based |
| Retention / pruning | — | `forja prune` |

---

## Slash Commands

Every command runs standalone — you don't have to start from `/forja:spec` if you only want a security scan.

### Pipeline

| Command | What it does |
|---------|-------------|
| `/forja:init` | Auto-detects stack, conventions, test framework; writes `forja/config.md` |
| `/forja:spec` | Decomposes a feature into granular tasks (<400 lines); creates Linear project with milestones and labels |
| `/forja:run` | Full pipeline for a single task: develop → test → perf → security → review → accept |
| `/forja:develop` | Implementation phase with N parallel agents (one per independent module) |
| `/forja:test` | Generates and runs unit + integration + e2e tests (3 parallel agents) |
| `/forja:perf` | Performance analysis of the current **diff** — N+1 queries, missing indexes, bundle size, re-renders |
| `/forja:security` | OWASP scan of the current **diff** — injection, auth, data exposure (3 parallel agents) |
| `/forja:review` | SOLID, DRY, KISS, Clean Code analysis |
| `/forja:homolog` | Presents the aggregated quality report for user acceptance |
| `/forja:pr` | Produces atomic Conventional Commits and opens a PR with the consolidated report |
| `/forja:update` | Pulls the latest command files from the CLI package |

### Audits (project-wide, not diff-scoped)

| Command | What it does |
|---------|-------------|
| `/forja:audit:backend` | Backend performance deep-dive: N+1, missing indexes, memory leaks, concurrency, architecture — **3 parallel agents** |
| `/forja:audit:frontend` | Frontend performance: auto-routes to Next.js 5-layer methodology or generic 11-category — **3 parallel agents** |
| `/forja:audit:database` | DB audit: MongoDB / PostgreSQL / MySQL — indexes, queries, modeling, config — **3 parallel agents** |
| `/forja:audit:security` | AppSec audit: OWASP Top 10, CWE mapping, A–F score, PoC for critical/high — **4 parallel agents** |
| `/forja:audit:run` | Meta-command that runs every applicable audit in parallel, based on `forja/config.md` project type |

**Pipeline phases vs audits:**
- Pipeline phases (`/forja:perf`, `/forja:security`) analyze **only the diff** — fast, task-scoped, runs on every task.
- Audit commands (`/forja:audit:*`) analyze the **entire codebase** — run periodically or before a release.

**Audits are typed `AuditModule`s, not just prompts.** Each audit implements the `AuditModule` interface (`src/plugin/types.ts`) with a Zod-validated `AuditFinding`/`AuditReport` shape, exported as JSON Schema (Draft 7) under `schemas/audit/`. The audit runner (`src/audits/runner.ts`) executes modules in parallel with a configurable concurrency cap (default 4, max 64) and per-module `AbortController` timeout (default 120s), invoking `onRun` / `onResult` lifecycle hooks for plugins. The security audit additionally runs `src/audits/security/poc-generator.ts`, which produces a curl/exploit PoC with CWE mapping for every `critical`/`high` finding that carries an `exploitVector`. Because audits are first-class plugins, you can ship your own under `forja/plugins/` or as a `forja-plugin-*` npm package — see [Plugins & Extensibility](#plugins--extensibility).

---

## CLI Reference

```
forja <command> [options]
```

### Project bootstrap

| Command | Purpose |
|---------|---------|
| `forja setup [--with-harness] [--skip-claude-md]` | Install slash commands, configure hooks, optionally spin up Postgres |
| `forja config get <key>` | Read `store_url`, `slack_webhook_url`, or `github_token` and show its source |
| `forja config set <key> <value>` | Persist a config value to `~/.forja/config.json` |
| `forja infra migrate` | Run pending database migrations |
| `forja infra status` | Show connection status and applied migrations |
| `forja infra up` / `down` | Docker-backed Postgres lifecycle (equivalent to compose up/down) |
| `forja migrate trace <path>` | Upgrade a `trace.jsonl` artifact to the current `schemaVersion` |
| `forja migrate report <path>` | Upgrade a markdown report's front-matter |
| `forja migrate postgres` | Migrate every row in the configured Postgres store |
| `forja policies migrate [--in <file>] [--out <file>] [--dry-run]` | Convert legacy YAML policies to the v2 Gate DSL format |
| `forja plugins list [--json] [--invalid]` | List registered plugins with ID, type, version, source, and path |

### Pipeline execution

| Command | Purpose |
|---------|---------|
| `forja run <issue-id> [--model <id>] [--dry-run] [--force] [--force-phase <name>] [--timeout-phase <name>:<seconds>]` | Start a tracked pipeline run |
| `forja resume <run-id>` | Resume an interrupted run from the last checkpoint |
| `forja replay <run-id> [--phase <name>] [--compare-to <run-id>]` | Re-execute a previous run; diff findings and gate decisions |

### Observability & auditing

| Command | Purpose |
|---------|---------|
| `forja trace --run <run-id> [--format md\|json\|pretty] [--output <file>]` | Full execution trace with timeline, findings, costs |
| `forja cost --run <run-id>` | USD breakdown per phase, per model, with token counts |
| `forja gate --run <run-id> [--policy <path>]` | Evaluate quality gates; exit `0=pass 1=warn 2=fail` |
| `forja ui [--port 4242]` | Launch the Next.js dashboard in your browser |

### Maintenance

| Command | Purpose |
|---------|---------|
| `forja prune [--older-than <duration>] [--dry-run]` | Delete runs past the retention window |
| `forja schedule list` | List all scheduled pipelines |
| `forja schedule create --cron <expr> --command <cmd>` | Register a new cron-based run |
| `forja schedule delete <id>` | Remove a schedule |

### Hook dispatcher (called by Claude Code, not you)

| Command | Purpose |
|---------|---------|
| `forja hook pre-tool-use` | Policy + redaction + tool gating |
| `forja hook post-tool-use` | Cost accounting + tool-call tracing |
| `forja hook stop` | FSM transition + run finalization |

---

## Dashboard

```bash
forja ui              # defaults to http://localhost:4242
```

A Next.js observability dashboard backed by the same PostgreSQL database as the CLI.

| Route | What you see |
|-------|--------------|
| `/` | Recent runs: issue, status, duration, cost, gate decision |
| `/runs` | Paginated table of every run with filters by status, issue, cost, gate |
| `/runs/<id>` | Gantt chart of tool calls, phase summaries, findings detail, cost breakdown, full trace |
| `/cost` | Total spend, breakdown by model, breakdown by phase, top-10 most expensive runs |
| `/issues` | Quality findings catalog across all runs, sortable by severity / category / file path |
| `/heatmap` | 2-D grid showing finding density per file × category — spots hotspots instantly |

---

## Policies

Three YAML files in `policies/` (overridable at the project level) drive every declarative decision: gate behavior, tool restrictions, and model assignment.

### `default.yaml` — Gate Policy (v2 DSL)

The gate policy is no longer a hard-coded severity table — it's a small declarative DSL (Domain-Specific Language) embedded in YAML. Each gate has a `when:` expression and a list of `then:` actions. Expressions support `and` / `or` / `not`, comparison operators (`> < >= <= == !=`), and predicate calls with typed arguments. The full EBNF grammar lives at [`docs/gates-dsl.md`](docs/gates-dsl.md); the rationale for staying YAML-embedded (instead of TypeScript hooks or CEL) is in [ADR 0001](docs/adr/0001-gates-dsl-yaml-only.md).

```yaml
version: '2'
gates:
  - name: gate-critical
    when: findings.countBySeverity("critical") > 0
    then:
      - fail
      - 'log("Critical finding: {{finding.title}}")'
      - notify_slack("#eng-alerts", "Critical finding in run {{runId}}")

  - name: gate-high
    when: findings.countBySeverity("high") > 0
    then: [fail]

  - name: gate-coverage-regression
    when: coverage.delta() < -0.02 and touched.matches("src/**")
    then: [warn]

  - name: gate-expensive-run
    when: cost.usd() > 5.00 or time.phaseDurationMs("dev") > 600000
    then:
      - 'log("Run {{runId}} is unusually expensive — see /cost dashboard")'
```

#### The 8 canonical predicates

Defined in [`src/policy/dsl/predicates.ts`](src/policy/dsl/predicates.ts) and exported via `PREDICATES_REGISTRY`. All return strongly-typed values usable in comparisons.

| Predicate | Returns | Purpose |
|-----------|---------|---------|
| `coverage.delta()` | `number` | Coverage delta vs. base (fraction; `-0.05` = -5pp) |
| `coverage.absolute()` | `number` | Absolute coverage percentage on this run |
| `diff.filesChanged()` | `number` | Count of files modified in the diff |
| `diff.linesChanged()` | `number` | Count of lines modified in the diff |
| `touched.matches(glob)` | `boolean` | Whether any changed file matches the glob |
| `time.phaseDurationMs(phase)` | `number` | Wall-clock duration of a phase, in ms |
| `cost.usd()` | `number` | Total LLM cost of the current run in USD |
| `findings.countBySeverity(sev)` | `number` | Count of findings at the given severity |

Adding a new predicate is a MINOR bump; renaming or removing one is a MAJOR bump (per [`SEMVER.md`](SEMVER.md)).

#### Justification trail

The DSL evaluator (`src/policy/dsl/evaluator.ts`) is a pure function: given an AST and a context, it returns a `decision` plus a `justification` string that traces every predicate value, comparison, and boolean operator that contributed. This justification is persisted to the `gate_decisions.justification` column (migration `0003_dsl_justification.sql`) — meaning every `pass` / `warn` / `fail` in your trace can be explained, audited, and replayed. No more "why did this gate fire?" archaeology.

#### Migrating legacy YAML

If you still have v1 policies (`finding.severity: critical` style), one command converts them in place:

```bash
forja policies migrate                    # convert every policies/*.yaml
forja policies migrate --in old.yaml --dry-run   # preview the diff
forja policies migrate --in old.yaml --out new.dsl.yaml
```

The migrator (`src/policy/dsl/migrator.ts`) is conservative: it warns instead of silently dropping rules it can't translate.

### `tools.yaml` — phase-scoped tool restrictions

```yaml
security:
  deny: [Write, Edit, Bash, MultiEdit]
  allow: [Read, Glob, Grep, WebSearch, WebFetch]
perf:
  deny: [Write, Edit, Bash, MultiEdit]
review:
  deny: [Write, Edit, Bash, MultiEdit]
develop:
  allow: "*"
```

The pre-tool-use hook enforces this. A security phase cannot accidentally (or adversarially) mutate your code.

### `models.yaml` — model assignment per phase

```yaml
spec: claude-opus-4-7
develop: claude-sonnet-4-6
test: claude-sonnet-4-6
perf: claude-sonnet-4-6
security: claude-sonnet-4-6
review: claude-sonnet-4-6
homolog: claude-haiku-4-5
pr: claude-haiku-4-5
audit_*: claude-sonnet-4-6
```

Pick the right brain for the right job: Opus for deep specification, Sonnet for the grind, Haiku for summarization. Cost drops ~5× without quality loss on the cheaper phases.

---

## Plugins & Extensibility

Forja ships a typed Plugin API so you can extend any layer of the pipeline — custom CLI commands, new pipeline phases, new finding categories, new policy actions, or entire audit modules — without forking the codebase. The full reference lives in [`PLUGIN-API.md`](PLUGIN-API.md), regenerated from `src/plugin/types.ts` via `npm run plugin-api:gen`.

### What you can extend

All five interfaces are exported from the **`@forja-hq/cli/plugin`** subpath (resolves to `dist/plugin/index.js`).

| Interface | Purpose |
|-----------|---------|
| **`Command`** | Add a custom `forja <id>` subcommand. Receives a `CommandContext` (`cwd`, `config`, `store`, `logger`) and returns an exit code. |
| **`Phase`** | Inject a new pipeline phase via `insertAfter`. Receives a `PhaseContext` (`runId`, `previousPhases`, `store`, `abortSignal`) and returns `pass` / `warn` / `fail`. |
| **`FindingCategory`** | Register a new category (`id`, `name`, `defaultSeverity`) so your findings are recognized by gate predicates and the dashboard heatmap. |
| **`PolicyAction`** | Define a custom `then:` action callable from the Gate DSL — e.g. file a Jira ticket, ping a webhook, push a metric. |
| **`AuditModule`** | Ship a full audit (`detect` + `run` + `report`) that the audit runner schedules in parallel with the built-in audits. |

### Discovery

The plugin loader auto-discovers extensions from two sources, with collision detection across both:

1. **Local plugins** — every JS/TS module under `forja/plugins/` (override path with `FORJA_PLUGIN_DIR`). Source = `local`.
2. **NPM plugins** — every package in `dependencies` or `devDependencies` whose name matches `forja-plugin-*`. Source = `npm`.

If the same plugin `id` is registered from two sources, bootstrap fails with a `PluginCollisionError` listing every conflicting source, path, and ID — no silent overrides.

```bash
forja plugins list           # human-readable table: ID | Type | Version | Source | Path
forja plugins list --json    # machine-readable for CI
```

### Lifecycle hooks

Every plugin can optionally implement four lifecycle hooks (`src/plugin/hooks.ts`). They run isolated from the pipeline — a thrown error or timeout never crashes a run, only surfaces as a `low`/`medium` finding in the trace.

| Hook | When it fires |
|------|---------------|
| `onRegister(ctx)` | Once at plugin bootstrap |
| `onRun(ctx)` | Before every pipeline phase |
| `onResult(ctx)` | After every phase completes |
| `onError(ctx)` | When a phase fails |

Hard timeout per hook is **5000 ms** by default, overridable via the `plugin_hook_timeout_ms` config key.

### Authoring a plugin in 9 steps

```bash
mkdir my-forja-plugin && cd my-forja-plugin
npm init -y && npm install --save-dev typescript
npm install --save-peer @forja-hq/cli
# write src/index.ts (see snippet below)
npx tsc
# in a target project, register: forja.config.ts → plugins: ['./dist/index.js']
forja plugins list           # verify
npm publish                  # publish as forja-plugin-<name> for auto-discovery
```

```ts
import type { Command } from '@forja-hq/cli/plugin';

export const greetCommand: Command = {
  id: 'my-plugin:greet',
  description: 'Prints a greeting to the log',
  labels: ['demo'],
  async run(ctx) {
    ctx.logger.info('Hello from my-plugin!');
    return { exitCode: 0, summary: 'Greeted successfully' };
  },
};
```

`id` must be globally unique — namespace with your plugin prefix (`my-plugin:greet`) to coexist cleanly with other plugins. `run` must never throw: catch internally and return a non-zero `exitCode`.

---

## Stability & Versioning

Forja treats its public surface like an API consumers depend on. Five artifacts together define what's promised, what's deprecated, and how upgrades happen.

### `SEMVER.md` — the contract

[`SEMVER.md`](SEMVER.md) enumerates exactly what's covered by Semantic Versioning starting at v1.0.0:

- **CLI flags** — every `forja` subcommand argument, with type, default, and `Since` version
- **Zod schemas** — `ConfigSchema`, `FindingSchema`, `GateDecisionSchema`, `CostEventSchema`, `RunStateEnum`, `TraceEventSchema`, `AuditFindingSchema`, `AuditReportSchema`, `StackInfoSchema`
- **Policy YAML formats** — gate / models / tools, all `version: "1"`
- **Gate DSL** — the 8 canonical predicates and their signatures
- **Plugin API** — `Command`, `Phase`, `FindingCategory`, `PolicyAction`, `AuditModule` and their context types
- **Audit JSON Schemas** — `schemas/audit/audit-finding.json` and `schemas/audit/audit-report.json` (Draft 7)

Anything not on that list — internal TypeScript symbols, the Postgres table layout, the binary checkpoint format, the slash-command markdown — is explicitly marked **internal** and may change in any release.

### `DEPRECATIONS.md` + `warnDeprecated`

Deprecated surfaces live in [`DEPRECATIONS.md`](DEPRECATIONS.md) for **two minor versions** before removal (longer if a security CVE forces an exception). At runtime, the `warnDeprecated()` helper emits a Node `DeprecationWarning` and writes a `deprecation_warning` trace event when `FORJA_RUN_ID` is set — so deprecated calls show up in your observability trail, not just stderr. Set `FORJA_SUPPRESS_DEPRECATION_WARNINGS=1` to silence.

### `CHANGELOG.md` (Keep a Changelog)

[`CHANGELOG.md`](CHANGELOG.md) follows the [Keep a Changelog](https://keepachangelog.com/) format and SemVer. Generate a draft entry from your conventional commits with:

```bash
npm run changelog
```

The release script refuses to publish if `CHANGELOG.md` has no entry for the version being tagged.

### Breaking-change CI

Every PR runs `.github/workflows/check-breaking-changes.yml`, which:

1. Re-emits JSON Schemas from current Zod schemas (`scripts/check-breaking-changes.ts`)
2. Diffs against the snapshot at `tests/fixtures/public-api/<major.minor>/`
3. Exits `2` and posts a PR comment if a breaking change is detected
4. Blocks the merge unless the PR carries the `allow-breaking` label

Snapshots are committed — accidentally breaking the public surface is a CI failure, not a runtime surprise.

### Release script

Tagging a release is an interactive command:

```bash
npm run release                          # interactive
npm run release -- --dry-run             # preview without tagging or pushing
npm run release -- --bump minor --yes    # non-interactive (CI)
```

`scripts/release.ts` auto-detects the bump (breaking-change CI exit code → MAJOR; `feat!:` / `feat:` / others in `git log` → MAJOR / MINOR / PATCH), validates that the matching `docs/upgrades/v<X.Y>.md` exists with no unfilled `...` placeholders, requires an RFC reference in `SEMVER.md` for MAJOR bumps, then creates the git tag.

### Upgrade guides

Every minor (and major) ships an upgrade guide at `docs/upgrades/v<X.Y>.md`, scaffolded from [`docs/upgrades/_template.md`](docs/upgrades/_template.md):

```
What's new   →   Breaking changes   →   Deprecations (v+2)   →   Migration steps   →   Known issues
```

The validator (`scripts/validate-upgrade-guide.ts`) parses the file and rejects any leftover placeholder line (`...`, `- ...`, `3. ...`). The guide also carries a CHANGELOG anchor link (`[v<X.Y>](../CHANGELOG.md#vxy)`), so consumers move between high-level changelog and step-by-step migration with one click.

### Gate Behavior config

The `gate_behavior` block in `forja/config.md` controls how the evaluator collapses multiple actions into a single decision. Logic: any `fail_gate` → `fail`; else any `warn_gate` → `warn`; else `pass`. Exit codes are stable and part of the public surface: `0=pass`, `1=warn`, `2=fail` — drop `forja gate --run <id>` into CI and you have a deterministic quality gate.

---

## Parallelism

| Phase | Agents | Parallel workload |
|-------|--------|-------------------|
| Spec | 2 | Linear fetch + codebase exploration |
| Develop | N | One agent per independent module |
| Test | 3 | Unit + integration + e2e |
| Quality | 3 | Performance + security + review **(simultaneously)** |
| Perf (diff) | 2 | Backend + frontend |
| Security (diff) | 3 | Injection / Auth / Data exposure |
| Review | N | One agent per code area |
| audit:backend | 3 | DB+NET / CPU+MEM+CONC / CODE+CONF+ARCH |
| audit:frontend | 3 | Rendering+Boundary / Data+Cache / Bundle+Assets |
| audit:database | 3 | Modeling+Writes / Indexes / Queries+Config |
| audit:security | 4 | Injection / Auth+Access / Data+Config / BusinessLogic+Compliance |
| audit:run | N | All applicable audits at once |

Each agent writes to isolated output — no race conditions.

---

## Stack Support

Detected automatically by `/forja:init`:

| Category | Supported |
|----------|-----------|
| **Runtimes** | Node.js, Python, Go, Rust, Java, Ruby, PHP, .NET |
| **Backend frameworks** | NestJS, Express, FastAPI, Django, Flask, Gin, Spring Boot, Rails, Laravel |
| **Frontend frameworks** | Next.js, React, Vue, Angular, Svelte, Astro, Nuxt, Remix |
| **Databases** | MongoDB, PostgreSQL, MySQL, Redis, SQLite, DynamoDB |
| **Test frameworks** | Vitest, Jest, Mocha, pytest, go test, RSpec, JUnit, Playwright, Cypress |
| **Project shapes** | Backend, frontend, fullstack, **monorepo** (workspace-aware) |

For monorepos, Forja detects workspaces and dispatches per-workspace agents — a change touching `apps/api` and `apps/web` triggers separate backend and frontend analyses in parallel.

---

## Examples

### Specify and ship a feature from a Linear issue

```
/forja:spec PROJ-42        # Decompose into tasks, create Linear project
/forja:run PROJ-43         # First task through the full pipeline
/forja:run PROJ-44         # Next task
/forja:pr                  # Ship
```

### Quick one-off security scan on the current diff

```
/forja:security
```

3 parallel agents for injection, auth/access, and data exposure — a full OWASP pass in ~60s.

### Resume after a session crash

```bash
forja trace --format pretty | head          # find the run ID
forja resume <run-id>                       # continue from last checkpoint
```

### See exactly what a run cost

```bash
forja cost --run <run-id>
# phase          model         tokens_in  tokens_out  usd
# spec           opus-4-7      42_000     8_100       $1.24
# develop        sonnet-4-6    128_400    61_200      $1.30
# test           sonnet-4-6    88_200     32_100      $0.75
# security       sonnet-4-6    54_000     18_900      $0.45
# TOTAL                                                $3.74
```

### Export a full auditable report for a run

```bash
forja trace --run <run-id> --format md --output audit.md
```

### Detect regressions in your pipeline itself

```bash
forja replay <run-id>
# +3 findings added (new bugs?)
# -1 finding removed (prev false positive or fixed?)
# gate: pass → warn (regression!)
# drift: dev command fingerprint changed
```

### Full project-wide audit before a release

```
/forja:audit:run
```

Reads `forja/config.md`, kicks off every applicable audit in parallel (backend perf + database + frontend perf + security), and produces a single consolidated PASS/WARN/FAIL report. Critical and high findings land in Linear as issues.

### Targeted deep audits

```
/forja:audit:security    # OWASP Top 10, A–F score, PoC for each critical/high
/forja:audit:database    # Index analysis, N+1, schema anti-patterns
/forja:audit:frontend    # Core Web Vitals, bundle size, rendering strategy
/forja:audit:backend     # N+1, concurrency, memory leaks, architecture
```

### Schedule a nightly audit

```bash
forja schedule create --cron "0 2 * * *" --command "/forja:audit:run"
forja schedule list
```

---

## Requirements

| Requirement | Required? | Notes |
|-------------|-----------|-------|
| [Claude Code](https://claude.ai/code) | **Yes** | CLI, desktop app, web app, or IDE extension |
| Git repository | **Yes** | Forja diffs against git history |
| Node.js 20+ | **Yes** | Required by the CLI binary |
| [GitHub CLI](https://cli.github.com/) (`gh`) | Recommended | Used by `/forja:pr` to open pull requests |
| [Linear](https://linear.app) MCP | Optional | Enables the native issue-tracking path |
| PostgreSQL 16+ | Optional | Required for the Harness Engine (any provider: local, RDS, Neon, Supabase, etc.) |
| Docker / Docker Compose | Optional | Easiest way to run Postgres locally via `--with-harness` |

---

## Project Layout

```
forja/
├── config.md                      # Project stack + conventions (from /forja:init)
├── plugins/                       # Local plugin modules (auto-discovered)
│   └── my-plugin/index.js
├── changes/
│   └── <feature-name>/
│       ├── proposal.md            # Requirements, acceptance criteria, scope
│       ├── design.md              # Architecture and technical decisions
│       ├── tasks.md               # Granular tasks (<400 lines each)
│       ├── report-<task>.md       # Per-task quality reports (with schemaVersion front-matter)
│       └── tracking.md            # Issue + finding tracker
├── audits/                        # Project-wide audit reports
│   ├── backend-<date>.md
│   ├── frontend-<date>.md
│   ├── database-<date>.md
│   ├── security-<date>.md
│   └── run-<date>.md              # Consolidated audit suite
└── state/                         # Harness runtime data (gitignored)
    └── runs/<run-id>/
        └── trace.jsonl            # JSONL with schemaVersion header
```

When Linear MCP is connected, everything under `forja/changes/` and the Linear tracking live in Linear instead — only `config.md` stays local.

### Repository layout (for contributors)

```
.
├── SEMVER.md                      # Public-API contract (CLI + schemas + DSL + Plugin API)
├── DEPRECATIONS.md                # Items scheduled for removal (2-minor window)
├── CHANGELOG.md                   # Keep a Changelog format
├── PLUGIN-API.md                  # Generated reference (npm run plugin-api:gen)
├── docs/
│   ├── gates-dsl.md               # EBNF grammar for the Gate DSL
│   ├── adr/0001-gates-dsl-yaml-only.md
│   └── upgrades/
│       ├── _template.md           # Source for every upgrade guide
│       └── v<X.Y>.md              # One guide per release
├── migrations/                    # SQL migrations (incl. 0004_schema_versioning.sql)
├── policies/                      # default.yaml (Gate DSL) + tools.yaml + models.yaml
├── schemas/audit/                 # JSON Schema (Draft 7) exports
└── src/
    ├── audits/{backend,frontend,database,security}/   # Typed AuditModules
    ├── plugin/                    # Plugin types, registry, loaders, hooks
    ├── policy/dsl/                # Parser, AST, evaluator, predicates, migrator
    └── store/migrations/          # Trace / report / Postgres migration runners
```

---

## Contributing

Slash commands are plain markdown. No build step to edit them.

```bash
git clone https://github.com/livertonoliveira/forja
cd forja
npm install
npm run dev           # tsx watch mode for the Harness
npm run typecheck
npm test
npm run build         # compile to bin/forja
forja setup           # install your local build into a test project
```

Editing a command:

1. Open `commands/forja/<name>.md`
2. Save
3. Re-run `forja setup` in your target project

PRs welcome — each change should ship as atomic Conventional Commits. (Yes, we dogfood Forja for Forja.)

---

## License

[BUSL-1.1](LICENSE) — Líverton Oliveira

Business Source License 1.1: free for internal use, evaluation, and non-production workloads. See the license file for the production-use change date.
