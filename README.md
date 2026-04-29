<p align="center">
  <img src="https://raw.githubusercontent.com/livertonoliveira/forja/main/docs/assets/logo.png" alt="Forja" height="96">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Slash_Commands-7C3AED?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTcgMTRsNS01IDUgNSIvPjwvc3ZnPg==" alt="Claude Code">
  <img src="https://img.shields.io/badge/Stack-Agnostic-10B981?style=for-the-badge" alt="Stack Agnóstico">
  <img src="https://img.shields.io/badge/License-BUSL--1.1-blue?style=for-the-badge" alt="Licença BUSL-1.1">
  <img src="https://img.shields.io/badge/Linear-Integration-5E6AD2?style=for-the-badge&logo=linear&logoColor=white" alt="Integração Linear">
  <img src="https://img.shields.io/badge/npm-%40forja--hq%2Fcli-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="pacote npm">
  <img src="https://github.com/livertonoliveira/forja/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

<p align="center">
  <a href="README.pt-BR.md">Português</a> · English
</p>

---

<p align="center">
  <strong>The automated development pipeline for Claude Code.</strong><br>
  From raw idea to delivered Pull Request — with quality gates, parallel agents, full observability, and an auditable cost trail for every tool call.
</p>

<p align="center">
  <a href="#why-forja">Why Forja</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#configuration">Configuration</a> · <a href="#pipeline-phase-control">Phases</a> ·
  <a href="#the-pipeline">The Pipeline</a> ·
  <a href="#harness-engine-1">Harness Engine</a> ·
  <a href="#slash-commands">Slash Commands</a> ·
  <a href="#cli-reference">CLI</a> ·
  <a href="#dashboard-1">Dashboard</a> ·
  <a href="#policies">Policies</a> ·
  <a href="#integrations-hub">Integrations</a> ·
  <a href="#plugins--extensibility">Plugins</a> ·
  <a href="#stability--versioning">Stability</a>
</p>

---

## Why Forja

Claude Code is an incredible hammer. Forja is the assembly line.

Delivering a feature the "normal" way with an LLM (Large Language Model) means juggling a dozen tabs: requirements, tasks, tests, security review, performance analysis, PR (Pull Request) description, tracker update, commit discipline. Each one burns context. Each one is one prompt away from being forgotten. And when the session crashes mid-way, you start from scratch.

Forja swaps that chaos for a **deterministic, auditable pipeline** running on top of Claude Code:

- **One command specifies the entire feature.** `/forja:spec "add password reset"` becomes a Linear project with milestones, labels, and granular tasks — each sized to fit in a single Claude session.
- **One command delivers the task.** `/forja:run TASK-ID` executes develop → test → performance → security → review → acceptance, with **3+ parallel agents** and a strict quality gate at each phase.
- **One command delivers the PR.** `/forja:pr` produces atomic Conventional Commits and a PR with an aggregated quality report.

Under the hood, the **Harness Engine** — a TypeScript runtime registered as a Claude Code hook — intercepts every tool call, persists to PostgreSQL, calculates cost in USD (US Dollars) per phase, applies policy-based gates, and exposes a Next.js dashboard so you can see (and replay) everything that happened.

### How the day-to-day changes

| Before | With Forja |
|--------|------------|
| "I think Claude did OK this time" | Full trace in Postgres, cost per phase in USD, deterministic gate in CI (Continuous Integration) |
| "Where's that critical finding from the previous run?" | `/runs/compare?ids=a,b,c` shows what changed — categorized by fingerprint |
| "Why did this pipeline cost so much?" | `/cost` with top 10 projects, breakdown by model/phase, automatic budget cap alert |
| "Slack went down and I missed the notification" | Retry with exponential backoff → persistent DLQ (Dead-Letter Queue) → Circuit Breaker — nothing lost, nothing flapping in a loop |
| "We'll integrate with Jira next week (maybe)" | Pluggable provider: Jira, GitLab, Azure DevOps, Bitbucket — choose by config, not by code |
| "The dashboard is ugly, nobody opens it" | Premium black/white/gold with Command Palette ⌘K, interactive Gantt, findings drill-down — built to stay open all day |

### What you get, point by point

| | Without Forja | With Forja |
|---|---|---|
| Feature planning | Free-form conversation | Linear project with granular tasks (<400 lines each) |
| Code quality | "Please review this" | 3 parallel agents: performance + security + SOLID/DRY/KISS |
| Test coverage | Ad-hoc | Unit + integration + e2e (End-to-End) generated in parallel |
| Security posture | Manual eyeballing | OWASP Top 10 scan on every diff, with policy-based gate |
| Cost visibility | None | USD per phase, per model, per tool call |
| Session crashed | Start over | `forja resume <run-id>` picks up from the last checkpoint |
| Quality verdict | LLM opinion | DSL (Domain-Specific Language) gates with 8 typed predicates + persisted justification; exit codes `0=pass 1=warn 2=fail` |
| Audit trail | Chat log | Full trace in PostgreSQL + signed GitHub Check |
| Commit discipline | "Initial commit" × 20 | Atomic Conventional Commits by design |
| Stack coverage | Manual setup per repo | Automatically detects Node / Python / Go / Rust / Java / Ruby / PHP / .NET |
| Extensibility | Fork the prompts | Typed Plugin API: custom commands, phases, audit modules, policy actions |
| Public API stability | Guesswork | `SEMVER.md`, `DEPRECATIONS.md`, breaking-change CI, signed upgrade guides |
| Artifact compatibility | "Works on my machine" | `schemaVersion` on every Zod schema, JSONL header, report front-matter, and Postgres row — `forja migrate` for upgrades |
| Issue tracker reach | Linear only | **Linear** (primary, MCP-native) + Jira / GitLab / Azure DevOps / Bitbucket via typed factory |
| External call resilience | Best-effort | RetryEngine (exponential backoff + jitter + `Retry-After`) → persistent DLQ in Postgres, visible at `/dlq` → Circuit Breaker per endpoint |
| Tracing | JSONL only | Native OpenTelemetry spans via `@opentelemetry/sdk-node` — exports to any backend (Jaeger / Tempo / Datadog / Honeycomb / OTLP collector) |
| Dashboard | Runs table | Premium black/white/gold UI: Command Palette ⌘K, run comparison, findings drill-down, Gantt, trend charts, activity heatmap, cost ranking + alerts and budget caps |
| CLI ergonomics | Bare commands | `forja doctor` + `--dry-run` + `forja completion <shell>` + contextual `forja help <cmd>` |
| Internationalization | English only | `artifact_language` (pt-BR / en) decoupled from the LLM's `prompt_language` (always `en`); UI translated via `next-intl` |

---

## Quick Start

Four lines to go from zero to a running dashboard:

```bash
# 1. Global CLI
npm install -g @forja-hq/cli

# 2. Slash commands + hooks + local Postgres via Docker
forja setup --with-harness

# 3. Diagnostics — fails loudly if anything is out of place
forja doctor

# 4. Premium dashboard (leave running in this terminal; open http://localhost:4242 in your browser)
forja ui
```

And the full loop inside Claude Code:

```
/forja:init                                # detects your stack
/forja:spec "add email-based password reset"
/forja:run <task-id>
/forja:pr
```

The full cycle: specify → run → deliver.

---

## Installation

Forja has two layers and you can adopt either one independently.

### Layer 1 — Slash commands only (lightweight, zero infra)

```bash
npm install -g @forja-hq/cli
forja setup
```

`forja setup` does three things:

1. Copies the `/forja:*` slash commands to `.claude/commands/forja/`
2. Configures the `PreToolUse`, `PostToolUse`, and `Stop` hooks in `.claude/settings.json`
3. Appends the Forja section to your `CLAUDE.md`

The pipeline runs immediately, with state saved in Linear issues or local markdown files. **No database, no Docker, no config.**

### Layer 2 — Harness Engine (persistent state, cost tracking, observability)

You have three ways to connect a PostgreSQL instance.

#### Option A — Local Postgres via Docker (zero config)

```bash
forja setup --with-harness
```

Copies `docker-compose.forja.yml` to your project, starts PostgreSQL 16, waits for the health check, and runs migrations. Uses the default DSN (Data Source Name) `postgresql://forja:forja@localhost:5432/forja`. Requires Docker.

#### Option B — Remote / managed Postgres (recommended for teams)

If you already have a PostgreSQL instance (RDS, Neon, Supabase, shared team database), point Forja to it:

```bash
# Persists the connection string in ~/.forja/config.json (user level)
forja config set store_url postgresql://user:password@host:5432/forja

# Then just run the migrations — no Docker
forja infra migrate
```

#### Option C — Environment variable (CI/CD, ephemeral shells)

```bash
export FORJA_STORE_URL=postgresql://user:password@host:5432/forja
forja infra migrate
```

#### Configuration priority

Forja resolves the store URL in this order, first match wins:

1. Environment variable `FORJA_STORE_URL`
2. `forja/.forja-config.json` (project level — commit to git if the team shares the same database)
3. `~/.forja/config.json` (user level — personal machine defaults)
4. Default: `postgresql://forja:forja@localhost:5432/forja` (Docker Compose convention)

#### Optional integrations

```bash
# GitHub Checks API — posts a signed check-run at the end of each pipeline
forja config set github_token ghp_...
# or: export GITHUB_TOKEN=ghp_...

# Slack — notifies critical findings via incoming webhook
forja config set slack_webhook_url https://hooks.slack.com/services/...
# or: export FORJA_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Upgrading from a previous version

If you already have Forja running and want everything that landed in this version (DLQ, Circuit Breaker, new providers, OTel, premium dashboard, `forja doctor`, `--dry-run`, `artifact_language`, etc.), the safe path is a five-command sequence:

```bash
# 1. Update the CLI globally
npm update -g @forja-hq/cli

# 2. Re-run setup — re-copies slash commands; hooks already in
#    .claude/settings.json remain intact
forja setup

# 3. Apply new migrations (search indices, trend, fingerprint,
#    cost breakdown, and the hook_dlq table)
forja infra migrate

# 4. Add the artifact_language field to forja/config.md without
#    overwriting anything already there
forja config migrate

# 5. Confirm everything is green before running the next pipeline
forja doctor
```

`forja doctor` is your safety net: it flags pending migrations, missing tokens, integrations with an open circuit breaker, and configs missing `artifact_language`. Exit code `0=pass 1=warn 2=fail` — if it exits `2`, read the message (each failure comes with a remediation hint) and only proceed after clearing it.

**Upgrading the database on production / team:** if you share a Postgres instance, run `forja infra migrate` on a single machine (CI or a runbook). Migrations `0005`–`0010` are additive (create indices and the `hook_dlq` table) — no downtime, no destructive change. Use `forja infra status` first to see what's applied and what will be applied.

**Old artifacts with `schemaVersion`:** if you have JSONL traces or markdown reports generated in very old versions (pre-`0004_schema_versioning.sql`), use the point commands:

```bash
forja migrate trace path/to/trace.jsonl --dry-run   # preview
forja migrate report path/to/report.md
forja migrate postgres                              # migrates every row in the database
```

The current schema version (`1.0`) introduced no breaking changes, so most teams only need the 5 steps above.

**New shortcuts worth enabling now:** `forja completion <bash|zsh|fish>` for autocomplete and `forja config set artifact_language en` if you want specs, issues, and PRs in English.

### Verification

```bash
forja config get store_url     # shows which DSN is active and its source
forja infra status             # connection status and migration state
forja plugins list             # installed plugins with version and type
```

Then open Claude Code and run `/forja:init`. If it detects your stack and creates `forja/config.md`, you're live.

---

## Configuration

Practical capabilities you can enable in seconds after setup.

### forja/config.md reference

`forja/config.md` is the single source of truth for every Forja command in a project. It is created by `/forja:init` and read automatically by all pipeline and audit commands — no flags needed at runtime.

#### Stack

Auto-detected by `/forja:init`. Documents the project's runtime, framework, database, package manager, test framework, lint and typecheck commands. You can edit it manually after init if detection missed something.

```markdown
## Stack
- Runtime: Node.js 20+
- Framework: NestJS
- Database: PostgreSQL 16 (Drizzle ORM)
- Package Manager: npm
- Test Framework: vitest
- Typecheck: tsc --noEmit
- Lint: eslint src --ext .ts
```

#### Conventions

Controls the language of all Forja-generated artifacts and defines project-wide coding conventions that agents follow.

```markdown
## Conventions
- artifact_language: pt-BR   # language for specs, issues, docs, PR descriptions, reports
- prompt_language: en        # LLM system prompts — fixed at en, do not change
- code_language: en          # code, variable names, commits, branch names
- Commit style: Conventional Commits (feat:, fix:, refactor:, test:, chore:)
- Branch naming: <type>/<issue-id>-<short-description>
- Atomic commits: one logical change per commit
```

`artifact_language` accepts any BCP 47 tag: `pt-BR`, `en`, `es`, `fr`, `de`, `ja`, `zh-CN`. `prompt_language` is always `en` — the LLM reasons in English and translates output to `artifact_language`. `code_language` is always `en` by convention.

#### Pipeline Phases

Each phase can be independently enabled or disabled. Disabled phases are skipped silently and logged.

```markdown
## Pipeline Phases
- dev: enabled       # /forja:develop — code implementation
- test: enabled      # /forja:test — unit, integration, e2e
- perf: enabled      # /forja:perf — performance analysis of the diff
- security: enabled  # /forja:security — OWASP scan of the diff
- review: enabled    # /forja:review — SOLID/DRY/KISS code review
- homolog: enabled   # /forja:homolog — consolidated report + acceptance gate
- pr: enabled        # /forja:pr — atomic commits + PR creation
```

Change `enabled` to `disabled` for any phase. `/forja:run` respects these toggles and skips the corresponding steps. Individual commands (e.g. `/forja:security`) also return immediately when their phase is disabled.

#### Gate Behavior

Controls what the pipeline does when a quality gate finds issues.

```markdown
## Gate Behavior
- on_fail: ask    # action when critical or high findings are detected
- on_warn: ask    # action when medium findings are detected
```

| Value | Applies to | Behavior |
|-------|-----------|----------|
| `ask` | `on_fail`, `on_warn` | Pause and prompt the user before proceeding (default) |
| `fix` | `on_fail`, `on_warn` | Apply fixes automatically without asking |
| `defer` | `on_fail` only | Create tracking issues and continue without fixing |
| `pass` | `on_warn` only | Continue to acceptance without fixing |

#### Linear Integration

Populated automatically by `/forja:init` when Linear MCP is connected. Controls where Forja stores artifacts (Linear Documents, issues, comments) instead of local markdown files.

```markdown
## Linear Integration
- Configured: yes
- Team: Acme Engineering
- Team ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- Default Labels: bug, feature, chore
```

Set `Configured: no` to fall back to local markdown storage under `forja/changes/`.

#### OTel (OpenTelemetry)

Enables distributed tracing export to any OpenTelemetry Collector (Jaeger, Tempo, Datadog Agent, Honeycomb).

```markdown
## OTel
- enabled: false
- endpoint: http://localhost:4317   # OTLP gRPC
- protocol: grpc                    # grpc | http | console
```

Can also be configured via environment variables (preferred for CI):

```bash
export FORJA_OTEL_ENABLED=true
export FORJA_OTEL_ENDPOINT=http://otel-collector:4317
export FORJA_OTEL_PROTOCOL=grpc
```

#### Rules

Free-form section for project-specific rules that all Forja agents will follow. Grows over time as you refine conventions.

```markdown
## Rules
- Never use `any` in TypeScript — use `unknown` and narrow explicitly
- All public functions must have a JSDoc comment
- Database queries must go through the repository layer, never directly in controllers
```

---

### Artifact language

Forja separates the artifact language (specs, issues, docs, PR descriptions) from the LLM's internal prompt language:

```bash
# Artifacts in English; the LLM continues to reason in English internally
forja config set artifact_language en
```

`artifact_language` accepts `pt-BR`, `en`, `es`, `fr`, `de`, `ja`, `zh-CN`. `prompt_language` is fixed at `en` — the LLM performs best in that language, and when it speaks to you, it translates to the chosen language. This guarantees output in the team's language without degrading reasoning quality. The dashboard follows the same `artifact_language` automatically, with full catalogs in `apps/ui/messages/{en,pt-BR}.json`.

### Pipeline phase control

Not every pipeline needs to go through every gate. If the security scan is too slow for the local development loop — but essential in CI — disable it per project without touching any prompt or policy:

```markdown
## Pipeline Phases
- dev: enabled
- test: enabled
- perf: enabled
- security: disabled  # ← skipped by /forja:run and /forja:security
- review: enabled
- homolog: enabled
- pr: enabled
```

When running `/forja:run`, the engine logs the skipped phases and continues:

```
[forja] phases disabled by config: security
[forja] → dev
[forja] → test
[forja] → review
[forja] → homolog
[forja] → pr
```

Each phase has an independent toggle: `dev`, `test`, `perf`, `security`, `review`, `homolog`, `pr`. All enabled by default. See the [forja/config.md reference](#forjaconfigmd-reference) for the full list of options.

> **Toggle scope:** runtime phases (`dev`, `test`, `homolog`, `pr`) are controlled by the engine. Skill-driven phases (`perf`, `security`, `review`) read `forja/config.md` before firing — `/forja:security` respects `security: disabled` and returns immediately.

### Shell autocomplete

```bash
forja completion zsh  > ~/.zsh/completions/_forja
forja completion bash > ~/.local/share/bash-completion/completions/forja
forja completion fish > ~/.config/fish/completions/forja.fish
```

Covers 100% of commands and flags. Dynamic values (run-ids, task-ids) are fetched via the local API with a static fallback — no error when the API is offline.

### Extensible diagnostics — `forja doctor`

```bash
forja doctor
#   ✓  Node 20.11.1
#   ✓  38 GB free disk space
#   ✓  Postgres reachable, 11/11 migrations applied
#   ✓  artifact_language: en
#   ✓  ANTHROPIC_API_KEY set
#   ⚠  Circuit breaker OPEN for https://hooks.slack.com/...
#       → 5 failures in 60s; cooldown ends in 38s
#   ✗  Jira health-check failed: 401 Unauthorized
#       → check JIRA_TOKEN (last rotated 2026-04-12?)
```

Each check is a module registered under `src/cli/doctor/checks/`. Output in ANSI or `--json` for CI. Exit code `0=pass 1=warn 2=fail` — plugs straight into your deploy pipeline.

### External integrations (only the ones you use)

Linear is the primary path and already comes via MCP (Model Context Protocol — Claude Code's native protocol). For others, export the token and add the block to `forja/config.md`:

```bash
# Jira
export JIRA_TOKEN=...
# integrations.jira: { baseUrl, email }

# GitLab (Cloud or self-managed)
export GITLAB_TOKEN=glpat-...
# integrations.gitlab: { baseUrl }

# Azure DevOps
export AZURE_DEVOPS_TOKEN=...
# integrations.azure: { organization, project }

# Bitbucket
export BITBUCKET_APP_PASSWORD=...
# integrations.bitbucket: { workspace, username }

# Datadog (metrics + events + logs)
export DD_API_KEY=...
export DD_APP_KEY=...
# integrations.datadog: { site }
```

Re-run `forja doctor` — each new provider appears with health-check latency and circuit breaker state. Switching from Jira to GitLab is a config diff, not a code diff. Architecture details in the [Integrations Hub](#integrations-hub).

### OpenTelemetry tracing

```bash
# Enable OTLP/gRPC export to a local collector (Jaeger/Tempo/Datadog Agent)
forja config set otel.enabled true
forja config set otel.endpoint http://localhost:4317
forja config set otel.protocol grpc

# Or via env vars (preferred in CI):
export FORJA_OTEL_ENABLED=true
export FORJA_OTEL_ENDPOINT=http://otel-collector:4317
export FORJA_OTEL_PROTOCOL=grpc   # grpc | http | console
```

Hierarchical spans (run → phase → tool call) propagate W3C TraceContext, so a run that calls a webhook connects naturally to the receiving service's trace in Tempo / Jaeger / Datadog / Honeycomb without any code changes. With OTel disabled, the SDK is loaded lazily and adds no measurable overhead. Details in the [Harness Engine](#harness-engine-1).

---

## The Pipeline

### 1. `/forja:spec` — from idea to decomposed plan

```
/forja:spec "feature description"   (or a Linear issue ID)
│
├─► 2 parallel agents  (Linear search  +  codebase map)
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
├─► QUALITY PHASES     3 gates in parallel, in a single pass:
│   ├── PERFORMANCE    2 agents  (scope: diff)
│   ├── SECURITY       3 agents  (OWASP on diff)
│   └── REVIEW         N agents  (SOLID / DRY / KISS)
│
├─► GATE CHECK
│   ├── fail   →  fix and re-run
│   ├── warn   →  asks the user
│   └── pass   →  continues
│
└─► ACCEPT             you approve
    │
    └─► /forja:pr      Atomic Conventional Commits + PR with report
```

### Quality gates

Each quality phase emits findings with a severity. The policy evaluator maps severity to a gate decision:

| Severity | Gate | Behavior |
|----------|------|----------|
| `critical` / `high` | **FAIL** | Pipeline stops. Findings become sub-issues in Linear. You fix or force override. |
| `medium` | **WARN** | Pipeline pauses. You decide: fix now or continue. |
| `low` / none | **PASS** | Pipeline continues automatically. |

Gate decisions are saved in the `gate_decisions` table and exposed via `forja gate --run <id>` with standard Unix exit codes: `0=pass 1=warn 2=fail`. Put this in your CI and you have a deterministic quality gate.

### Dual storage (Linear or local)

| | With Linear MCP | Standalone |
|---|---|---|
| Proposal & Design | Linear Documents | `forja/changes/<feature>/proposal.md` + `design.md` |
| Tasks | Linear Issues (with milestones + labels) | `forja/changes/<feature>/tasks.md` |
| Quality reports | Issue comments | `forja/changes/<feature>/report-*.md` |
| Tracking | Linear sub-issues | `forja/changes/<feature>/tracking.md` |
| Local footprint | Only `forja/config.md` | Full `forja/` workspace |

Either way, **all context survives a crashed session**.

### End-to-end pipeline in practice

```bash
# 1. Specify the feature (Linear MCP creates project + milestones + issues)
/forja:spec "automatic API token rotation"

# 2. Before touching state, check what the pipeline would do
forja run TASK-42 --dry-run
# Output prefixed with [DRY-RUN]; zero side effects (notify, GitHub Check, webhook, cost write)

# 3. Run for real — generates OTel spans, measures cost, applies gates
forja run TASK-42

# 4. Compare with the previous run of the same task
forja replay <previous-run-id> --compare-to <new-run-id>
# or open the dashboard:
open "http://localhost:4242/runs/compare?ids=<a>,<b>"

# 5. If there's a critical finding, drill-down via /runs/<id>/findings/<id>
#    — "Create issue" button uses the active IntegrationProvider (Linear by default)

# 6. Cost for the run + project accumulated total
forja cost --run <run-id>
open http://localhost:4242/cost

# 7. When everything is green
/forja:pr
```

Project-wide audits (not diff-scoped) whenever you want:

```bash
/forja:audit:run    # backend + frontend + database + security in parallel
```

---

## Harness Engine

The Harness is what transforms Forja from a set of prompts into a real, observable runtime.

### How it plugs into Claude Code

The `forja` binary registers itself as a [Claude Code hook](https://docs.anthropic.com/en/docs/claude-code/hooks) in `.claude/settings.json`. Every tool call passes through it:

```
Claude Code wants to call a tool
  │
  ▼
forja hook pre-tool-use
  ├─ receives {tool_name, tool_input} via stdin
  ├─ applies tool policy (e.g. security phase cannot Write or Bash)
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
  ├─ calculates USD cost per model (Opus 15/75, Sonnet 3/15, Haiku 0.8/4 per 1M)
  ├─ records duration, tool name, span ID, agent ID
  └─ writes cost_event + tool_call to PostgreSQL
  │
  ▼
Claude stops
  │
  ▼
forja hook stop
  ├─ detects phase timeouts
  ├─ transitions the FSM (dev → test → perf → ...)
  ├─ finalizes the run status and writes the consolidated trace
  └─ fires actions: GitHub Check, Slack notification, webhooks
```

Net effect: **every tool call is an immutable row in your database**, tagged with run, phase, agent, and cost. You can replay any run, detect regressions, bill to the right cost center, or prove what happened during an incident.

### State machine

A pipeline run traverses an explicit FSM (Finite State Machine) with row-level locks that prevent concurrent transitions:

```
happy path:
  init  →  spec  →  dev  →  test  →  perf  →  security  →  review  →  homolog  →  pr  →  done

failure path:
  perf | security | review   →   failed   →   dev   (retry from dev)
```

Invalid transitions are rejected at the database level — you literally cannot skip `security` because the FSM won't allow it.

### Checkpoints and session resilience

Each phase writes a checkpoint on completion. If Claude crashes, times out, or a human hits Ctrl+C:

```bash
forja resume <run-id>   # resumes from the last completed phase
```

Combined with `idempotency.ts`, re-running an already-completed phase is a no-op unless you pass `--force` or `--force-phase dev`.

### Replay and regression detection

```bash
forja replay <run-id>
```

Re-executes a previous run with identical inputs and **diffs the results**: findings added (new bugs), removed (fixed or false positives), gates that changed. Command files are fingerprinted (SHA-256 of the phase prompt), so you can tell whether a regression came from a code change or a prompt change — no more "it worked yesterday".

### Cost

```bash
forja cost --run <run-id>
```

Breakdown by phase and model, in USD, with token counts. The accumulator runs inside `post-tool-use`, so cost is calculated **as it happens** — you can kill a runaway pipeline mid-flight.

Pricing table (per 1M tokens, in / out):
- Opus 4.x — `$15 / $75`
- Sonnet 4.x — `$3 / $15`
- Haiku 4.x — `$0.80 / $4`

### Secret redaction

Hook output payloads are scanned with:
- Pattern-based regex for known prefixes (`sk-ant-*`, `ghp_*`, AWS keys, bearer tokens)
- Shannon entropy heuristic for unknown high-entropy strings

Matches are replaced with `[REDACTED]` before any write to traces, database, or Slack. Your tokens don't leak into your observability stack.

### GitHub Checks

When a pipeline finishes, Forja parses the git remote, extracts `owner/repo`, and posts a signed check-run on the current SHA via the GitHub Checks API. Your PR shows a native ✅/❌ next to the commit — no GitHub Actions setup required.

### Slack notifications

Policy actions can fire Slack webhooks with templated messages:

```yaml
actions:
  on_critical:
    - kind: notify_slack
      channel: "#eng-alerts"
      text: "Critical finding in {{runId}}: {{finding.title}}"
```

Only HTTPS webhooks are accepted.

### Hook resilience — RetryEngine + DLQ + Circuit Breaker

Every outbound side effect (Slack webhook, GitHub Checks API, Datadog batch, IntegrationProvider call, generic `http_post` policy action) traverses three composed layers:

```
hook call
   │
   ▼
CircuitBreaker (per endpoint, src/hooks/circuit-breaker.ts)
   │   states: closed → open → half-open
   │   failureThreshold=5 in 60s · cooldownMs=60s · successThreshold=2
   │   open  →  fails in <1ms (no network call)
   ▼
RetryEngine (src/hooks/retry.ts)
   │   maxRetries=5 · baseDelay=500ms · maxDelay=30s · jitter
   │   honours `Retry-After` (seconds or HTTP-date)
   │   4xx (except 429) skips retry → goes directly to the DLQ
   ▼
External API
   │
   ▼ (on permanent failure)
DLQ (hook_dlq table, migration 0010_dlq_schema.sql)
   │   {hook_type, payload, error_message, attempts, status: dead|reprocessed|ignored}
   │   visible at /dlq with reprocess / ignore actions
   └─ available to any user of the instance
```

`forja doctor` reports the live circuit breaker state per endpoint, so you discover an intermittent integration without opening the dashboard. Every retry, transition, and DLQ enqueue is emitted as an OpenTelemetry span — they appear alongside the rest of your run trace.

### Native OpenTelemetry tracing

The Harness instruments itself with `@opentelemetry/sdk-node`. When OTel is enabled (`forja config set otel.enabled true` or `FORJA_OTEL_ENABLED=true`), each run produces a hierarchical trace: parent span for the run, child spans per phase, grandchild spans per tool call. Supported exporters out of the box:

| Exporter | How to enable |
|----------|---------------|
| **OTLP / gRPC** *(default)* | `FORJA_OTEL_PROTOCOL=grpc` + `FORJA_OTEL_ENDPOINT=http://collector:4317` |
| **OTLP / HTTP** | `FORJA_OTEL_PROTOCOL=http` + `FORJA_OTEL_ENDPOINT=http://collector:4318/v1/traces` |
| **Console** | `FORJA_OTEL_PROTOCOL=console` |
| **None** *(disabled)* | `FORJA_OTEL_ENABLED=false` |

Spans propagate W3C TraceContext, so a CI run that calls a webhook can be correlated with the receiving service's trace in Tempo / Jaeger / Datadog / Honeycomb without any code changes. With OTel disabled, the SDK is loaded lazily and adds no measurable overhead.

### Observability

- **JSONL traces** at `forja/state/runs/<run-id>/trace.jsonl` — always written, even if the database is unavailable (dual-write architecture)
- **PostgreSQL** for queryable history
- **OpenTelemetry** with spans for every phase, hook, retry, and circuit breaker transition (above)
- **Next.js dashboard** (`forja ui`) for humans

### Schema versioning and migrations

Every artifact Forja produces — Zod-validated records, JSONL trace headers, markdown report front-matter, and 7 Postgres tables (`runs`, `phases`, `findings`, `gate_decisions`, `tool_calls`, `cost_events`, `issue_links`) — carries a `schemaVersion` field stamped from `CURRENT_SCHEMA_VERSION` (`src/schemas/versioning.ts`). The current version is `1.0`, defined by migration `0004_schema_versioning.sql`.

Upgrading old artifacts is a one-command operation:

```bash
forja migrate trace path/to/trace.jsonl   # in-place upgrade of a JSONL trace
forja migrate report path/to/report.md    # upgrade a report's front-matter
forja migrate postgres                    # migrates every row in the configured Postgres store

# All subcommands accept:
#   --dry-run            preview changes without writing
#   --from <version>     explicit source version (default: reads from header)
#   --to   <version>     explicit target version (default: CURRENT_SCHEMA_VERSION)
```

The runners (`src/store/migrations/{trace,report,postgres}-runner.ts`) walk a registry of versioned migration steps, applying them in sequence. Forward compatibility is validated by golden roundtrip tests: fixtures in `tests/fixtures/schemas/{pre-1.0,v1.0,hypothetical-1.1}/` exercise pre-1.0 → 1.0 upgrades, current parsing, and tolerance for future versions with unknown fields. CI re-runs the roundtrip suite on every change to `src/schemas/` or `src/store/migrations/`.

Releases that bump `schemaVersion` ship an upgrade guide at `docs/upgrades/v<X.Y>.md`, generated from `docs/upgrades/_template.md` and validated by `scripts/validate-upgrade-guide.ts` before tagging — the release script refuses to publish if any `...` placeholder remains unfilled.

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

Recurring runs via cron. Schedules live in `.forja/schedules.json`; next fire times are calculated via `cron-parser`.

### Harness vs slash-only — side by side

| Capability | Slash only | With Harness |
|------------|------------|--------------|
| Pipeline state | Linear / markdown | PostgreSQL + FSM |
| Interrupted session | Start over | `forja resume <run-id>` |
| Cost tracking | — | USD per phase via `forja cost`, plus `/cost` UI with alerts and budget caps |
| Gate verdict | LLM decision | DSL evaluator with persisted justification and applied exit-code |
| Tool call history | — | Queryable in PostgreSQL |
| Real-time interception | — | Pre/post hooks block disallowed tools |
| Dashboard | — | Next.js app `forja ui` — premium UI, ⌘K palette, run comparison, drill-down, /dlq |
| Replay + regression detection | — | `forja replay <run-id>` |
| Scheduled pipelines | — | `forja schedule` |
| External issue trackers | — | Linear / Jira / GitLab / Azure DevOps / Bitbucket via `IntegrationProvider` |
| GitHub Checks | — | Automatic at run end |
| OpenTelemetry tracing | — | OTLP gRPC / HTTP / console exporters via `@opentelemetry/sdk-node` |
| Hook resilience | — | RetryEngine + DLQ + Circuit Breaker per endpoint |
| Secret redaction | — | Pattern + entropy |
| Retention / pruning | — | `forja prune` |

---

## Slash Commands

Each command runs standalone — you don't need to start with `/forja:spec` if you just want a security scan.

### Pipeline

| Command | What it does |
|---------|--------------|
| `/forja:init` | Detects stack, conventions, and test framework; writes `forja/config.md` |
| `/forja:spec` | Decomposes a feature into granular tasks (<400 lines); creates Linear project with milestones and labels |
| `/forja:run` | Full pipeline for a task: develop → test → perf → security → review → acceptance |
| `/forja:develop` | Implementation phase with N parallel agents (one per independent module) |
| `/forja:test` | Generates and runs unit + integration + e2e tests (3 parallel agents) |
| `/forja:perf` | Performance analysis of the **current diff** — N+1, missing indices, bundle size, re-renders |
| `/forja:security` | OWASP scan of the **current diff** — injection, auth, data exposure (3 parallel agents) |
| `/forja:review` | SOLID, DRY, KISS, Clean Code analysis |
| `/forja:homolog` | Presents the aggregated quality report for user acceptance |
| `/forja:pr` | Produces atomic Conventional Commits and opens a PR with a consolidated report |
| `/forja:update` | Pulls updated command files from the CLI package |

### Audits (scope: entire project, not diff)

| Command | What it does |
|---------|--------------|
| `/forja:audit:backend` | Deep-dive backend performance: N+1, missing indices, memory leaks, concurrency, architecture — **3 parallel agents** |
| `/forja:audit:frontend` | Frontend performance: automatically routes to Next.js methodology (5 layers) or generic (11 categories) — **3 parallel agents** |
| `/forja:audit:database` | Database audit: MongoDB / PostgreSQL / MySQL — indices, queries, modeling, config — **3 parallel agents** |
| `/forja:audit:security` | AppSec: OWASP Top 10, CWE mapping, A–F score, PoC for critical/high — **4 parallel agents** |
| `/forja:audit:run` | Meta-command that runs every applicable audit in parallel, based on the project type in `forja/config.md` |

**Pipeline phases vs audits:**
- Pipeline phases (`/forja:perf`, `/forja:security`) analyze **only the diff** — fast, task-scoped, run on every task.
- Audit commands (`/forja:audit:*`) analyze the **entire codebase** — run periodically or before a release.

**Audits are typed `AuditModule`s, not just prompts.** Each implements the `AuditModule` interface (`src/plugin/types.ts`) with a Zod-validated `AuditFinding`/`AuditReport` format, exported as JSON Schema (Draft 7) under `schemas/audit/`. The audit runner (`src/audits/runner.ts`) executes modules in parallel with a configurable concurrency cap (default 4, max 64) and a per-module timeout via `AbortController` (default 120s), invoking `onRun` / `onResult` lifecycle hooks for plugins. The security audit also runs `src/audits/security/poc-generator.ts`, which produces a curl/exploit PoC (Proof of Concept) with CWE mapping for every `critical`/`high` finding that carries an `exploitVector`. Because audits are first-class plugins, you can ship your own in `forja/plugins/` or as an `npm` package `forja-plugin-*` — see [Plugins & Extensibility](#plugins--extensibility).

---

## CLI Reference

```
forja <command> [options]
```

### Project bootstrap

| Command | Purpose |
|---------|---------|
| `forja setup [--with-harness] [--skip-claude-md]` | Installs slash commands, configures hooks, optionally starts Postgres |
| `forja doctor [--json]` | Extensible diagnostics — checks Node, disk, DB connection + pending migrations, tokens (Anthropic / GitHub / Linear), `artifact_language` validity, and live circuit breaker state for each registered integration. Exit `0=pass 1=warn 2=fail` |
| `forja help [<command>]` | Contextual help generated from the command registry — adapts to terminal width, respects `NO_COLOR` |
| `forja completion <bash\|zsh\|fish>` | Emits a completion script for the chosen shell (`forja completion zsh > ~/.zsh/completions/_forja`) |
| `forja config get <key>` | Reads `store_url`, `slack_webhook_url`, `github_token`, or `artifact_language` and shows the source |
| `forja config set <key> <value>` | Persists a value to `~/.forja/config.json` |
| `forja config migrate` | Adds missing fields (e.g. `artifact_language`) to `forja/config.md` without overwriting existing ones |
| `forja infra migrate` | Runs pending database migrations |
| `forja infra status` | Connection status and applied migrations |
| `forja infra up` / `down` | Postgres lifecycle via Docker (equivalent to compose up/down) |
| `forja migrate trace <path>` | Upgrades a `trace.jsonl` artifact to the current `schemaVersion` |
| `forja migrate report <path>` | Upgrades a markdown report's front-matter |
| `forja migrate postgres` | Migrates every row in the configured Postgres store |
| `forja policies migrate [--in <file>] [--out <file>] [--dry-run]` | Converts legacy YAML policies to the v2 gate DSL format |
| `forja plugins list [--json] [--invalid]` | Lists registered plugins with ID, type, version, source, and path |

**Global flag — `--dry-run` / `-n`:** available on every command that has side effects (PR creation, GitHub Check post, Slack notify, webhook POST, cost-event write). Output prefixed with `[DRY-RUN]` and zero writes — validated by `src/cli/middleware/dry-run.test.ts`. Prepend it to any run to see what would happen without touching state.

### Pipeline execution

| Command | Purpose |
|---------|---------|
| `forja run <issue-id> [--model <id>] [--dry-run] [--force] [--force-phase <name>] [--timeout-phase <name>:<seconds>]` | Starts a tracked run |
| `forja resume <run-id>` | Resumes an interrupted run from the last checkpoint |
| `forja replay <run-id> [--phase <name>] [--compare-to <run-id>]` | Re-executes a previous run; diffs findings and gates |

### Observability and audit

| Command | Purpose |
|---------|---------|
| `forja trace --run <run-id> [--format md\|json\|pretty] [--output <file>]` | Full execution trace with timeline, findings, costs |
| `forja cost --run <run-id>` | USD breakdown by phase, by model, with token counts |
| `forja gate --run <run-id> [--policy <path>]` | Evaluates quality gates; exit `0=pass 1=warn 2=fail` |
| `forja ui [--port 4242]` | Starts the Next.js dashboard in the browser |

### Maintenance

| Command | Purpose |
|---------|---------|
| `forja prune [--older-than <duration>] [--dry-run]` | Deletes runs beyond the retention window |
| `forja schedule list` | Lists scheduled pipelines |
| `forja schedule create --cron <expr> --command <cmd>` | Registers a new cron run |
| `forja schedule delete <id>` | Removes a schedule |

### Hook dispatcher (called by Claude Code, not by you)

| Command | Purpose |
|---------|---------|
| `forja hook pre-tool-use` | Policy + redaction + tool gating |
| `forja hook post-tool-use` | Cost accounting + tool call tracing |
| `forja hook stop` | FSM transition + run finalization |

---

## Dashboard

```bash
forja ui              # default at http://localhost:4242
```

An observability Next.js dashboard backed by the same PostgreSQL as the CLI. Premium black / white / gold UI built with Next.js 14 (App Router) + Tailwind + shadcn/ui — designed to be the dashboard your team actually keeps open all day, not the one they merely tolerate.

| Route | What's there |
|-------|-------------|
| `/` | Recent runs: issue, status, duration, cost, gate decision |
| `/runs` | Paginated table of every run with URL-persisted filters (status, issue, gate, date range) via `nuqs`, full-text search on `tsvector` |
| `/runs/<id>` | Gantt chart with real phase timestamps and gate markers, per-phase summary, findings detail, cost breakdown, full trace |
| `/runs/<id>/findings/<finding-id>` | Drill-down sheet with full context, OWASP / CWE mapping, fingerprint history, and a *Create Issue* button for any registered IntegrationProvider |
| `/runs/compare?ids=a,b,c` | Side-by-side diff of 2–5 runs — findings categorized as new / resolved / persistent by fingerprint, cost / duration delta, cross-project warning |
| `/cost` | Top 10 ranked projects, stacked breakdown by phase × model, 7×24 mini-heatmap (day × hour), CSV export |
| `/cost` *(alerts panel)* | CRUD (Create, Read, Update, Delete) over `forja/alerts.json`: thresholds by project / period (day / week / month), notify via Slack / email, optional budget cap |
| `/issues` | Quality findings catalogue across all runs, sortable by severity / category / file path |
| `/heatmap` | Activity heatmap — runs by day × hour in the gold palette |
| `/dlq` | DLQ (Dead Letter Queue) dashboard for hook deliveries that failed — filters by status (`dead` / `reprocessed` / `ignored`) and hook type, payload preview with syntax highlighting, reprocess / ignore actions |

**Power-user features:**

- **Command Palette ⌘K** (`cmdk`) — fuzzy navigation across runs / issues / routes, plus quick actions like *Open last run*, *Switch language*, *Compare selected runs*
- **Toast notifications** (`sonner`) for every CRUD action with success / error / warning / info variants
- **i18n** — switch between **en** / **pt-BR** in the top bar; the active locale follows `artifact_language` from `forja/config.md`
- **Loading choreography** — staggered reveal animations and dedicated skeletons in `loading.tsx` per route, no layout shift
- **Storybook gallery** at `apps/ui/.storybook/` (`npm --prefix apps/ui run storybook`) documents every component (Badge, Button, Card, Sheet, Skeleton, Table, FilterBar, TrendChart, HeatmapGrid, Palette)

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Opens the Command Palette |
| `g r` | Go to Runs |
| `g c` | Go to Cost |
| `g h` | Go to Heatmap |
| `g d` | Go to DLQ |
| `Esc` | Closes the drill-down Sheet and returns focus to the originating element |

---

## Policies

Three YAML files in `policies/` (overridable at project level) control every declarative decision: gate behavior, tool restrictions, and model assignment.

### `default.yaml` — Gate policy (DSL v2)

The gate policy is no longer a hardcoded severity table — it's a small, declarative DSL embedded in YAML. Each gate has a `when:` expression and a list of `then:` actions. Expressions support `and` / `or` / `not`, comparison operators (`> < >= <= == !=`), and predicate calls with typed arguments. The full EBNF grammar is in [`docs/gates-dsl.md`](docs/gates-dsl.md); the rationale for keeping it embedded in YAML (instead of TypeScript hooks or CEL) is in [ADR (Architecture Decision Record) 0001](docs/adr/0001-gates-dsl-yaml-only.md).

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

Defined in [`src/policy/dsl/predicates.ts`](src/policy/dsl/predicates.ts) and exported via `PREDICATES_REGISTRY`. All return strongly typed values, usable in comparisons.

| Predicate | Returns | Purpose |
|-----------|---------|---------|
| `coverage.delta()` | `number` | Coverage delta vs base (fraction; `-0.05` = -5pp) |
| `coverage.absolute()` | `number` | Absolute coverage percentage in the run |
| `diff.filesChanged()` | `number` | Number of files modified in the diff |
| `diff.linesChanged()` | `number` | Number of lines modified in the diff |
| `touched.matches(glob)` | `boolean` | Whether any modified file matches the glob |
| `time.phaseDurationMs(phase)` | `number` | Wall-clock duration of a phase, in ms |
| `cost.usd()` | `number` | Total USD cost of the current run |
| `findings.countBySeverity(sev)` | `number` | Number of findings at the given severity |

Adding a new predicate is a MINOR bump; renaming or removing one is MAJOR (per [`SEMVER.md`](SEMVER.md)).

#### Justification trail

The DSL evaluator (`src/policy/dsl/evaluator.ts`) is a pure function: given an AST and a context, it returns a `decision` plus a `justification` string that traces every predicate value, comparison, and boolean operator that contributed. This justification is persisted in the `gate_decisions.justification` column (migration `0003_dsl_justification.sql`) — meaning every `pass` / `warn` / `fail` in your trace can be explained, audited, and replayed. No more "why did that gate fire?" archaeology.

#### Migrating legacy YAML

If you still have v1 policies (style `finding.severity: critical`), a command converts them in-place:

```bash
forja policies migrate                    # converts each policies/*.yaml
forja policies migrate --in old.yaml --dry-run   # preview the diff
forja policies migrate --in old.yaml --out new.dsl.yaml
```

The migrator (`src/policy/dsl/migrator.ts`) is conservative: it warns instead of silently discarding rules it cannot translate.

### `tools.yaml` — tool restrictions per phase

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

The pre-tool-use hook enforces this. A security phase cannot (accidentally or adversarially) mutate your code.

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

Pick the right brain for the right job: Opus for deep specification, Sonnet for the grind, Haiku for summarization. Cost drops ~5× without losing quality on lighter phases.

---

## Plugins & Extensibility

Forja offers a typed Plugin API to extend any layer of the pipeline — custom CLI commands, new phases, finding categories, policy actions, or entire audit modules — without forking the codebase. Full reference at [`PLUGIN-API.md`](PLUGIN-API.md), regenerated from `src/plugin/types.ts` via `npm run plugin-api:gen`.

### What you can extend

All five interfaces are exported via the **`@forja-hq/cli/plugin`** subpath (resolves to `dist/plugin/index.js`).

| Interface | Purpose |
|-----------|---------|
| **`Command`** | Adds a custom `forja <id>` subcommand. Receives a `CommandContext` (`cwd`, `config`, `store`, `logger`) and returns an exit code. |
| **`Phase`** | Injects a new phase into the pipeline via `insertAfter`. Receives a `PhaseContext` (`runId`, `previousPhases`, `store`, `abortSignal`) and returns `pass` / `warn` / `fail`. |
| **`FindingCategory`** | Registers a new category (`id`, `name`, `defaultSeverity`) so your findings are recognized by gate predicates and the dashboard heatmap. |
| **`PolicyAction`** | Defines a custom `then:` action callable from the DSL — e.g. open a Jira ticket, ping a webhook, push a metric. |
| **`AuditModule`** | Ships a complete audit (`detect` + `run` + `report`) that the runner schedules in parallel with built-in audits. |

### Discovery

The plugin loader discovers extensions automatically from two sources, with collision detection between them:

1. **Local plugins** — every JS/TS module under `forja/plugins/` (override path with `FORJA_PLUGIN_DIR`). Source = `local`.
2. **NPM plugins** — every package in `dependencies` or `devDependencies` whose name matches `forja-plugin-*`. Source = `npm`.

If the same plugin `id` is registered from two sources, bootstrap fails with `PluginCollisionError` listing each source, path, and conflicting ID — no silent override.

```bash
forja plugins list           # human-readable table: ID | Type | Version | Source | Path
forja plugins list --json    # machine-readable, for CI
```

### Lifecycle hooks

Each plugin can optionally implement four lifecycle hooks (`src/plugin/hooks.ts`). They run isolated from the pipeline — a thrown error or timeout never brings down a run, only appears as a `low`/`medium` finding in the trace.

| Hook | When it fires |
|------|---------------|
| `onRegister(ctx)` | Once at plugin bootstrap |
| `onRun(ctx)` | Before each pipeline phase |
| `onResult(ctx)` | After each phase completes |
| `onError(ctx)` | When a phase fails |

Hard timeout per hook is **5000 ms** by default, overridable via the `plugin_hook_timeout_ms` config key.

### Authoring a plugin in 9 steps

```bash
mkdir my-forja-plugin && cd my-forja-plugin
npm init -y && npm install --save-dev typescript
npm install --save-peer @forja-hq/cli
# write src/index.ts (snippet below)
npx tsc
# in a target project, register: forja.config.ts → plugins: ['./dist/index.js']
forja plugins list           # validate
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

`id` must be globally unique — namespace with your plugin prefix (`my-plugin:greet`) to coexist with others. `run` must never throw: catch internally and return a non-zero `exitCode`.

---

## Integrations Hub

The primary issue tracker is **Linear**, integrated natively via Linear MCP — this is the default path used by `/forja:spec` and `/forja:run` for projects, milestones, sub-issues, labels, and status sync.

For teams on a different tracker, a typed `IntegrationProvider` interface (`src/integrations/base.ts`) plus a factory (`src/integrations/factory.ts`) make every secondary tracker speak the same six-method contract:

```ts
interface IntegrationProvider {
  name: string
  createIssue(input: IssueInput): Promise<IssueOutput>
  updateIssue(id: string, patch: IssuePatch): Promise<void>
  closeIssue(id: string): Promise<void>
  createPR(input: PRInput): Promise<PROutput>
  addComment(targetId: string, body: string): Promise<void>
  healthCheck(): Promise<HealthStatus>
}
```

The factory is a registry of `(config) => Provider | null` functions — each provider module self-registers on import and returns its instance only when its config block is present. The first non-null match wins. Switching trackers is a config diff, not a code diff.

### Secondary providers

| Provider | Source | Capabilities |
|----------|--------|--------------|
| **Jira** | `src/integrations/jira.ts` | REST v3, dynamic transitions (Done/Closed/Resolved fallback chain), ADF comments, Epic/Story hierarchy, severity → priority mapping (`critical→Highest`, `high→High`, etc.) |
| **GitLab** | `src/integrations/gitlab.ts` | API v4, MRs + Issues with labels and milestones, build status, **Cloud + self-managed** instances |
| **Azure DevOps** | `src/integrations/azure-devops.ts` | Work items, PRs on Azure Repos, **process template detection** (Agile / Scrum / CMMI), Epic → Feature → User Story hierarchy |
| **Bitbucket** | `src/integrations/bitbucket.ts` | API v2, PRs + comments, Issues with **graceful fallback** (PR comment when Issues is disabled), build status (INPROGRESS / SUCCESSFUL / FAILED) |
| **GitHub Checks** | `src/integrations/github-checks.ts` | Signed check-run at every pipeline end — your PR shows a native ✅/❌ next to the commit |
| **Mock** | `src/integrations/mock.ts` | In-memory `MockIntegrationProvider` used by the test suite |

The **Datadog** module (`src/integrations/datadog.ts`) is a sibling — it does not implement `IntegrationProvider` because its job is observability, not issue tracking. It emits custom metrics (`forja.run.duration`, `forja.run.cost`, `forja.findings.count`), Event Stream entries, and structured logs, all batched in 10-second windows to respect rate limits.

### Configuring providers

Provider config lives under the `integrations:` block of `forja/config.md` (parsed via `IntegrationConfig` in `src/schemas/config.ts`). Enabling Jira, for example, is just adding a `jira` section with `baseUrl` + auth, plus the relevant token via env var (`JIRA_TOKEN`, `GITLAB_TOKEN`, `AZURE_DEVOPS_TOKEN`, `BITBUCKET_APP_PASSWORD`, `DD_API_KEY` + `DD_APP_KEY` for Datadog). `forja doctor` validates each credential set and pings `healthCheck()` on every registered provider — failures appear with remediation hints and exit code 2.

### Authoring a custom provider

Implement `IntegrationProvider`, then call `registerProviderFactory((config) => /* return your provider | null */)` at module load time. The pipeline picks the first non-null match. Ship it as a plugin (`forja-plugin-*` package or in `forja/plugins/`) for auto-discovery.

---

## Stability & Versioning

Forja treats its public surface as an API that consumers depend on. Five artifacts together define what is promised, what is deprecated, and how upgrades happen.

### `SEMVER.md` — the contract

[`SEMVER.md`](SEMVER.md) enumerates exactly what is covered by Semantic Versioning from v1.0.0:

- **CLI flags** — every `forja` subcommand argument, with type, default, and origin version (`Since`)
- **Zod schemas** — `ConfigSchema`, `FindingSchema`, `GateDecisionSchema`, `CostEventSchema`, `RunStateEnum`, `TraceEventSchema`, `AuditFindingSchema`, `AuditReportSchema`, `StackInfoSchema`
- **Policy YAML formats** — gate / models / tools, all `version: "1"`
- **Gate DSL** — the 8 canonical predicates and their signatures
- **Plugin API** — `Command`, `Phase`, `FindingCategory`, `PolicyAction`, `AuditModule`, and their context types
- **Audit JSON Schemas** — `schemas/audit/audit-finding.json` and `schemas/audit/audit-report.json` (Draft 7)

Anything outside this list — internal TypeScript symbols, Postgres table layout, checkpoint binary format, slash command markdown — is explicitly marked as **internal** and may change in any release.

### `DEPRECATIONS.md` + `warnDeprecated`

Deprecated surfaces live in [`DEPRECATIONS.md`](DEPRECATIONS.md) for **two minor versions** before removal (more if a security CVE forces an exception). At runtime, the `warnDeprecated()` helper emits a Node `DeprecationWarning` and writes a `deprecation_warning` trace event when `FORJA_RUN_ID` is set — so deprecated calls appear in your observability trail, not just on stderr. Set `FORJA_SUPPRESS_DEPRECATION_WARNINGS=1` to silence.

### `CHANGELOG.md` (Keep a Changelog)

[`CHANGELOG.md`](CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/) format and SemVer. Generate a draft entry from your conventional commits with:

```bash
npm run changelog
```

The release script refuses to publish if `CHANGELOG.md` has no entry for the version being tagged.

### Breaking-change CI

Every PR runs `.github/workflows/check-breaking-changes.yml`, which:

1. Re-emits JSON Schemas from the current Zod schemas (`scripts/check-breaking-changes.ts`)
2. Diffs against the snapshot in `tests/fixtures/public-api/<major.minor>/`
3. Exits with code `2` and posts a PR comment if a breaking change is detected
4. Blocks the merge unless the PR carries the `allow-breaking` label

Snapshots are versioned — accidentally breaking the public surface is a CI failure, not a runtime surprise.

### Release script

Release tagging is an interactive command:

```bash
npm run release                          # interactive
npm run release -- --dry-run             # preview without tagging or pushing
npm run release -- --bump minor --yes    # non-interactive (CI)
```

`scripts/release.ts` detects the bump automatically (breaking-change CI exit code → MAJOR; `feat!:` / `feat:` / other in `git log` → MAJOR / MINOR / PATCH), validates that the corresponding `docs/upgrades/v<X.Y>.md` exists without unfilled `...` placeholders, requires an RFC reference in `SEMVER.md` for MAJOR bumps, and then creates the git tag.

### Upgrade guides

Every minor (and major) ships an upgrade guide at `docs/upgrades/v<X.Y>.md`, scaffolded from [`docs/upgrades/_template.md`](docs/upgrades/_template.md):

```
What's new   →   Breaking changes   →   Deprecations (v+2)   →   Migration steps   →   Known issues
```

The validator (`scripts/validate-upgrade-guide.ts`) parses the file and rejects any remaining placeholder line (`...`, `- ...`, `3. ...`). The guide also carries an anchor link to the CHANGELOG (`[v<X.Y>](../CHANGELOG.md#vxy)`), so consumers can navigate between the high-level changelog and the step-by-step migration in one click.

### Config Gate Behavior

The `gate_behavior` block in `forja/config.md` controls how the evaluator collapses multiple actions into a single decision. Logic: any `fail_gate` → `fail`; else any `warn_gate` → `warn`; else `pass`. Exit codes are stable and part of the public surface: `0=pass`, `1=warn`, `2=fail` — put `forja gate --run <id>` in CI and you have a deterministic quality gate.

---

## Parallelism

| Phase | Agents | Parallel workload |
|-------|--------|-------------------|
| Spec | 2 | Linear search + codebase exploration |
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
| audit:run | N | Every applicable audit at once |

Each agent writes to isolated output — no race conditions.

---

## Supported Stack

Auto-detected by `/forja:init`:

| Category | Supported |
|----------|-----------|
| **Runtimes** | Node.js, Python, Go, Rust, Java, Ruby, PHP, .NET |
| **Backend frameworks** | NestJS, Express, FastAPI, Django, Flask, Gin, Spring Boot, Rails, Laravel |
| **Frontend frameworks** | Next.js, React, Vue, Angular, Svelte, Astro, Nuxt, Remix |
| **Databases** | MongoDB, PostgreSQL, MySQL, Redis, SQLite, DynamoDB |
| **Test frameworks** | Vitest, Jest, Mocha, pytest, go test, RSpec, JUnit, Playwright, Cypress |
| **Project formats** | Backend, frontend, fullstack, **monorepo** (workspace-aware) |

In monorepos, Forja detects workspaces and dispatches agents per workspace — a change touching `apps/api` and `apps/web` triggers separate backend and frontend analyses, in parallel.

---

## Practical Examples

### Specify and deliver a feature from a Linear issue

```
/forja:spec PROJ-42        # decomposes into tasks, creates Linear project
/forja:run PROJ-43         # first task through the full pipeline
/forja:run PROJ-44         # next task
/forja:pr                  # deliver
```

### One-off security scan on the current diff

```
/forja:security
```

3 parallel agents for injection, auth/access, and data exposure — a full OWASP pass in ~60s.

### Compare two runs of the same task

```
http://localhost:4242/runs/compare?ids=<run-a>,<run-b>
```

Or via CLI: `forja replay <run-id> --compare-to <other-id>`. The diff categorizes findings as **new**, **resolved**, or **persistent** by fingerprint, shows cost / duration delta, and flags cross-project comparisons.

### Dry-run a pipeline first

```bash
forja run PROJ-42 --dry-run
# every Slack notify, GitHub Check, webhook, and cost-event write is logged with `[DRY-RUN]`
# zero side effects — perfect for previewing a config change in CI
```

### Diagnose an unstable integration

```bash
forja doctor
#   ✓  Node 20.11.1
#   ✓  38 GB free disk space
#   ✓  Postgres reachable, 11/11 migrations applied
#   ✗  Jira health-check failed: 401 Unauthorized
#       → check JIRA_TOKEN (last rotated 2026-04-12?)
#   ⚠  Circuit breaker OPEN for https://hooks.slack.com/...
#       → 5 failures in 60s; cooldown ends in 38s
```

### Resume after a crashed session

```bash
forja trace --format pretty | head          # locate the run ID
forja resume <run-id>                       # continues from the last checkpoint
```

### See exactly how much a run cost

```bash
forja cost --run <run-id>
# phase           model         tokens_in  tokens_out  usd
# spec            opus-4-7      42_000     8_100       $1.24
# develop         sonnet-4-6    128_400    61_200      $1.30
# test            sonnet-4-6    88_200     32_100      $0.75
# security        sonnet-4-6    54_000     18_900      $0.45
# TOTAL                                                $3.74
```

### Export a full auditable report for a run

```bash
forja trace --run <run-id> --format md --output audit.md
```

### Detect regressions in your own pipeline

```bash
forja replay <run-id>
# +3 findings added (new bugs?)
# -1 finding removed (previous false positive or fixed?)
# gate: pass → warn (regression!)
# drift: dev command fingerprint changed
```

### Full project audit before a release

```
/forja:audit:run
```

Reads `forja/config.md`, fires every applicable audit in parallel (backend perf + database + frontend perf + security), and produces a single consolidated PASS/WARN/FAIL report. Critical and high findings go to Linear as issues.

### Targeted deep audits

```
/forja:audit:security    # OWASP Top 10, A–F score, PoC for each critical/high
/forja:audit:database    # index analysis, N+1, schema anti-patterns
/forja:audit:frontend    # Core Web Vitals, bundle size, rendering strategy
/forja:audit:backend     # N+1, concurrency, memory leaks, architecture
```

### Schedule a nightly audit

```bash
forja schedule create --cron "0 2 * * *" --command "/forja:audit:run"
forja schedule list
```

---

## Next Steps

- **Whole team on the same Postgres**: point `store_url` at a managed database (Neon, Supabase, RDS) and every engineer sees each other's runs at `/runs`.
- **Automatic weekly audit**: `forja schedule create --cron "0 2 * * 1" --command "/forja:audit:run"` schedules backend + frontend + database + security every Monday at 02:00.
- **Your own plugin**: implement `IntegrationProvider`, `Phase`, `AuditModule`, `Command`, `FindingCategory`, or `PolicyAction` (see [`PLUGIN-API.md`](PLUGIN-API.md)) and ship as `forja-plugin-*` on npm for auto-discovery.

---

## Requirements

| Requirement | Required? | Notes |
|-------------|-----------|-------|
| [Claude Code](https://claude.ai/code) | **Yes** | CLI, desktop app, web app, or IDE extension |
| Git repository | **Yes** | Forja diffs against git history |
| Node.js 20+ | **Yes** | Required by the CLI binary |
| [GitHub CLI](https://cli.github.com/) (`gh`) | Recommended | Used by `/forja:pr` to open PRs |
| [Linear](https://linear.app) MCP | Optional | Enables the native issue tracking path |
| PostgreSQL 16+ | Optional | Required by the Harness Engine (any provider: local, RDS, Neon, Supabase, etc.) |
| Docker / Docker Compose | Optional | Easiest path for local Postgres via `--with-harness` |

---

## Project Layout

```
forja/
├── config.md                      # Stack + project conventions (output of /forja:init)
├── shared-patterns.md             # Index of canonical prompt patterns (human navigation only)
├── patterns/                      # Atomic prompt fragments — include only what you need
│   ├── storage-mode.md            # Linear vs Local mode detection
│   ├── load-artifacts.md          # Artifact loading matrix by context
│   ├── gates.md                   # Gate rules (PASS/WARN/FAIL)
│   ├── severity.md                # Severity definitions by domain
│   ├── parallelism.md             # Parallel agent strategy
│   └── language.md                # Artifact language rule
├── plugins/                       # Local plugin modules (auto-discovery)
│   └── my-plugin/index.js
├── changes/
│   └── <feature-name>/
│       ├── proposal.md            # Requirements, acceptance criteria, scope
│       ├── design.md              # Architecture and technical decisions
│       ├── tasks.md               # Granular tasks (<400 lines each)
│       ├── report-<task>.md       # Quality reports per task (with schemaVersion front-matter)
│       └── tracking.md            # Issue + findings tracker
├── audits/                        # Project-wide audit reports
│   ├── backend-<date>.md
│   ├── frontend-<date>.md
│   ├── database-<date>.md
│   ├── security-<date>.md
│   └── run-<date>.md              # Consolidated audit suite report
└── state/                         # Harness runtime data (gitignored)
    └── runs/<run-id>/
        └── trace.jsonl            # JSONL with schemaVersion header
```

When Linear MCP is connected, everything under `forja/changes/` and tracking live in Linear — only `config.md` stays local.

### Repository layout (for contributors)

```
.
├── SEMVER.md                      # Public API contract (CLI + schemas + DSL + Plugin API)
├── DEPRECATIONS.md                # Items scheduled for removal (2-minor window)
├── CHANGELOG.md                   # Keep a Changelog format
├── PLUGIN-API.md                  # Generated reference (npm run plugin-api:gen)
├── docs/
│   ├── gates-dsl.md               # Gate DSL EBNF grammar
│   ├── adr/0001-gates-dsl-yaml-only.md
│   └── upgrades/
│       ├── _template.md           # Source for every upgrade guide
│       └── v<X.Y>.md              # One guide per release
├── migrations/                    # SQL migrations (incl. 0004_schema_versioning.sql)
├── policies/                      # default.yaml (gate DSL) + tools.yaml + models.yaml
├── schemas/audit/                 # JSON Schema exports (Draft 7)
└── src/
    ├── audits/{backend,frontend,database,security}/   # Typed AuditModules
    ├── plugin/                    # Plugin types, registry, loaders, and hooks
    ├── policy/dsl/                # Parser, AST, evaluator, predicates, migrator
    └── store/migrations/          # trace / report / Postgres migration runners
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
npm run build         # compiles to bin/forja
forja setup           # installs your local build in a test project
```

Editing a command:

1. Open `commands/forja/<name>.md`
2. Save
3. Re-run `forja setup` in the target project

PRs are welcome — every change must ship as atomic Conventional Commits. (Yes, we dogfood Forja with Forja.)

---

## License

[BUSL-1.1](LICENSE) — Líverton Oliveira

Business Source License 1.1: free for internal use, evaluation, and non-production workloads. See the license file for the production use change date.
