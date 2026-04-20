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
  <a href="#policies">Policies</a>
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
| Quality gate | LLM opinion | Policy YAML evaluator, `0=pass 1=warn 2=fail` exit codes |
| Audit trail | Chat log | Full PostgreSQL trace + signed GitHub Check |
| Commit discipline | "Initial commit" × 20 | Atomic Conventional Commits by design |
| Stack coverage | Manual setup per repo | Auto-detects Node / Python / Go / Rust / Java / Ruby / PHP / .NET |

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
| Quality gate verdict | LLM decision | Policy YAML, exit-code enforced |
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

Three YAML files in `policies/` (overridable at the project level) drive every declarative decision.

### `default.yaml` — gate policy

```yaml
# Phase timeouts (seconds)
timeouts:
  develop: 600
  test: 300
  perf: 180
  security: 180
  review: 180
  homolog: 60
  pr: 120

# Finding-to-gate mapping
rules:
  - when: { severity: [critical, high] }
    action: fail_gate
  - when: { severity: [medium] }
    action: warn_gate
  - when: { severity: [low] }
    action: log

# Side effects
actions:
  on_fail:
    - kind: notify_slack
      text: "Pipeline {{runId}} FAILED: {{finding.title}}"
    - kind: http_post
      url: https://events.pagerduty.com/...
```

Override per project with `forja/.forja-policy.yml`.

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
├── changes/
│   └── <feature-name>/
│       ├── proposal.md            # Requirements, acceptance criteria, scope
│       ├── design.md              # Architecture and technical decisions
│       ├── tasks.md               # Granular tasks (<400 lines each)
│       ├── report-<task>.md       # Per-task quality reports
│       └── tracking.md            # Issue + finding tracker
├── audits/                        # Project-wide audit reports
│   ├── backend-<date>.md
│   ├── frontend-<date>.md
│   ├── database-<date>.md
│   ├── security-<date>.md
│   └── run-<date>.md              # Consolidated audit suite
└── state/                         # Harness runtime data (gitignored)
    └── runs/<run-id>/
        └── trace.jsonl
```

When Linear MCP is connected, everything under `forja/changes/` and the Linear tracking live in Linear instead — only `config.md` stays local.

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
