<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Slash_Commands-7C3AED?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTcgMTRsNS01IDUgNSIvPjwvc3ZnPg==" alt="Claude Code">
  <img src="https://img.shields.io/badge/Stack-Agnostic-10B981?style=for-the-badge" alt="Stack Agnostic">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/Linear-Integration-5E6AD2?style=for-the-badge&logo=linear&logoColor=white" alt="Linear Integration">
  <img src="https://github.com/livertonoliveira/forja/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

<h1 align="center">Forja</h1>

<p align="center">
  <strong>Automated development pipeline for Claude Code.</strong><br>
  From issue to pull request — with quality gates, parallel agents, and persistent artifacts.
</p>

<p align="center">
  <a href="#what-is-forja">What is Forja?</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#harness-engine">Harness Engine</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#how-it-works">How it Works</a> ·
  <a href="#stack-support">Stack Support</a>
</p>

---

## What is Forja?

Forja is a framework of [Claude Code](https://claude.ai/code) slash commands that automates your **entire** development workflow:

```
/forja:spec "add user authentication with JWT"    # Specify & decompose
/forja:run ABC-123                                 # Implement one task
/forja:pr                                          # Ship it
```

**`/forja:spec`** decomposes your feature into granular tasks (<400 lines each), organized in a Linear project with milestones, labels, and rich issue descriptions.

**`/forja:run`** takes a single task through the full pipeline: **Implementation → Testing → Performance → Security → Code Review → Acceptance** — with quality gates and maximum parallelism.

Everything produces persistent artifacts — in Linear or local markdown files — that serve as durable memory for the LLM.

Forja has two layers:

- **Slash commands** — Claude Code markdown commands that drive the AI pipeline (works anywhere, no extra setup)
- **Harness Engine** — A TypeScript runtime that adds persistent state, cost tracking, resumable runs, and real-time observability via Claude Code hooks

---

## Quick Start

### 1. Install

```bash
npm install -g @forja-hq/cli
forja setup
```

### 2. Initialize

```
/forja:init
```

Auto-detects your stack, conventions, test framework, and creates `forja/config.md`.

### 3. Specify

```
/forja:spec "add password reset via email"
```

Or from a Linear issue:

```
/forja:spec ABC-123
```

Creates a Linear project with milestones and granular tasks (<400 lines each), plus `proposal.md` and `design.md` artifacts.

### 4. Develop (one task at a time)

```
/forja:run ABC-124    # Work on a specific task
```

Runs the full pipeline for that task: develop → test → perf → security → review → accept.

### 5. Ship

```
/forja:pr
```

Creates atomic commits (Conventional Commits), pushes the branch, and opens a PR with the full quality report.

---

## Installation

### Slash commands only (lightweight)

```bash
npm install -g @forja-hq/cli
forja setup
```

That's it. `forja setup` copies the slash commands to `.claude/commands/forja/`, configures the Claude Code hooks in `.claude/settings.json`, and appends Forja configuration to your `CLAUDE.md`. The pipeline works immediately via the LLM, with state stored in Linear or local markdown files.

### With Harness Engine (persistent state + cost tracking)

```bash
npm install -g @forja-hq/cli
forja setup --with-harness
```

`--with-harness` additionally copies `docker-compose.forja.yml` to your project, starts PostgreSQL, and runs the database migrations. Requires Docker.

### Optional configuration

```bash
# Override the default PostgreSQL connection
forja config set store_url postgresql://user:password@host:5432/dbname

# Or via environment variable
export FORJA_STORE_URL=postgresql://user:password@host:5432/dbname

# GitHub Checks API integration
export GITHUB_TOKEN=ghp_...

# Slack notifications
export FORJA_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

Configuration is resolved in this priority order:
1. `FORJA_STORE_URL` environment variable
2. `forja/.forja-config.json` (project-level)
3. `~/.forja/config.json` (user-level)
4. Default: `postgresql://forja:forja@localhost:5432/forja`

### Updating

```bash
npm update -g @forja-hq/cli
forja setup          # re-copies updated slash commands
```

### Verify

Open Claude Code in your project and run `/forja:init`. If it detects your stack, you're good to go.

---

## Harness Engine

The Harness Engine is the infrastructure layer that turns Forja from ephemeral slash commands into a persistent, observable pipeline runtime.

### Why it exists

Without the Harness, Forja's state lives only in Linear issues or local markdown files. If a Claude Code session breaks mid-pipeline, you lose track of what ran. Quality gate decisions are made by the LLM and not independently verifiable. There's no way to know how much a run cost.

The Harness solves all of this.

### How it works

The `forja` binary registers itself as a [Claude Code hook](https://docs.anthropic.com/en/docs/claude-code/hooks) that intercepts every tool call:

```
Claude Code executes a tool
  → forja hook pre-tool-use     (receives tool name + input via stdin)
      → logs event to PostgreSQL, applies policies, can block the tool
  → Claude executes the tool
  → forja hook post-tool-use    (receives tool output)
      → accumulates cost in USD, records duration, detects findings
  → Claude stops
  → forja hook stop
      → finalizes run, consolidates quality report
```

This means **every tool call** is stored in PostgreSQL with cost, duration, and result — creating a complete, immutable audit trail.

### CLI reference

```bash
# Start a tracked pipeline run
forja run <issue-id> [--model claude-opus-4-7] [--dry-run] [--force]

# Resume an interrupted run from the last checkpoint
forja resume <run-id>

# Evaluate quality gates for a run (exit: 0=pass 1=warn 2=fail)
forja gate --run <run-id> [--policy path/to/policy.yml]

# View full execution trace
forja trace --run <run-id> [--format md|json|pretty] [--output report.md]

# Cost breakdown per phase in USD
forja cost --run <run-id>

# Launch local observability dashboard
forja ui

# Config management
forja config get store_url
forja config set store_url postgresql://...
forja config list

# Database management
forja infra migrate           # Run pending migrations
forja infra status            # Show connection and migration status

# Maintenance
forja prune                   # Delete runs older than retention period

# Cron scheduling
forja schedule list
forja schedule delete <id>

# Replay a previous run with the same inputs
forja replay <run-id>
```

### What the Harness adds vs. slash commands alone

| Capability | Slash commands only | With Harness |
|---|---|---|
| Pipeline state persistence | Linear or markdown files | PostgreSQL with FSM |
| Session interruption | Restart from scratch | `forja resume <run-id>` |
| Cost tracking | Not available | USD per phase via `forja cost` |
| Quality gate auditability | LLM decision | Policy-based evaluator (YAML) |
| Tool call history | Not available | Full trace in PostgreSQL |
| Real-time tool interception | Not available | Pre/post hooks |
| Observability dashboard | Not available | `forja ui` |
| Scheduled pipelines | Not available | `forja schedule` |
| GitHub Checks integration | Not available | Automatic on run completion |

### Quality gate policies

Gates are evaluated by the policy engine in `policies/`. You can override the default policy per project:

```yaml
# forja/.forja-policy.yml
gate:
  fail_on: [critical, high]
  warn_on: [medium]
  pass_on: [low]
actions:
  on_fail:
    - create_linear_issue
    - post_slack_notification
  on_warn:
    - create_linear_issue
```

---

## How it Works

```
           ┌─────────────────────────────────────────────────┐
           │                /forja:spec                      │
           │                                                 │
           │   INPUT ──► 2 parallel agents ──► APPROVE       │
           │   (issue      (Linear data +      (you review   │
           │   or text)     codebase)            the plan)    │
           │                    │                             │
           │              proposal.md                        │
           │              design.md                          │
           │              Linear project                     │
           │                ├── Milestone 1                  │
           │                │   ├── Task A (~150 lines)      │
           │                │   └── Task B (~200 lines)      │
           │                └── Milestone 2                  │
           │                    ├── Task C (~120 lines)      │
           │                    └── Task D (~180 lines)      │
           └─────────────────────────────────────────────────┘

           ┌─────────────────────────────────────────────────┐
           │          /forja:run TASK-ID  (per task)          │
           │                                                 │
           │   DEVELOP ──► TEST ──────────────────────┐      │
           │   (parallel    (3 parallel agents:       │      │
           │    per module)  unit+integration+e2e)    │      │
           │                                          │      │
           │        ┌─────────────┼─────────────┐     │      │
           │        │             │             │     │      │
           │   PERFORMANCE   SECURITY      REVIEW    │      │
           │        │             │             │     │      │
           │        └─────────────┼─────────────┘     │      │
           │                      │                   │      │
           │               GATE CHECK                 │      │
           │               fail → fix → re-run        │      │
           │               warn → ask user            │      │
           │               pass → continue            │      │
           │                      │                   │      │
           │                  ACCEPT ← you approve    │      │
           └──────────────────────┼───────────────────┘      │
                                  │
                           ┌──────▼───────┐
                           │  /forja:pr   │  Atomic commits + PR
                           └──────────────┘
```

### Quality Gates

Each quality phase (performance, security, review) produces findings with severity:

| Severity | Gate | Behavior |
|----------|------|----------|
| `critical` / `high` | **FAIL** | Pipeline stops. Creates issues. Asks to fix. |
| `medium` | **WARN** | Pipeline pauses. Asks: fix now or continue? |
| `low` / none | **PASS** | Pipeline continues automatically. |

### Dual Storage

Forja adapts to your tooling:

| | With Linear | Without Linear |
|---|---|---|
| **Proposal & Design** | Linear Documents | `forja/changes/<feature>/proposal.md` + `design.md` |
| **Tasks** | Linear Issues (milestones + labels) | `forja/changes/<feature>/tasks.md` |
| **Quality Reports** | Comments on issues | `forja/changes/<feature>/report-*.md` |
| **Tracking** | Linear sub-issues | `forja/changes/<feature>/tracking.md` |
| **Local files** | Only `forja/config.md` | Full `forja/` workspace |

Either way, if the session breaks, all context is preserved — in Linear or in local files.

### Linear Integration

If [Linear](https://linear.app) is connected via MCP:

| Event | Linear Action |
|-------|--------------|
| Intake receives issue ID | Fetches full issue data |
| Development starts | Updates status to "In Progress" |
| Quality findings detected | Creates detailed sub-issues |
| Fixes applied | Closes sub-issues |
| PR created | Updates status to "In Review" |

**No Linear?** No problem. Everything falls back to `tracking.md` with the same level of detail.

---

## Commands

### Pipeline Commands

| Command | What it does |
|---------|-------------|
| `/forja:init` | Auto-detect stack, conventions, create `forja/config.md` |
| `/forja:spec` | Deep specification: decompose into tasks (<400 lines), create Linear project with milestones and labels |
| `/forja:run` | Development pipeline for a task: develop → test → quality → accept |
| `/forja:develop` | Implement code following project conventions |
| `/forja:test` | Generate & run unit, integration, and e2e tests |
| `/forja:perf` | Analyze **diff** for N+1 queries, missing indexes, bundle size |
| `/forja:security` | OWASP scan of **diff**: injection, auth, data exposure |
| `/forja:review` | SOLID, DRY, KISS, Clean Code analysis |
| `/forja:homolog` | Present quality report for user approval |
| `/forja:pr` | Atomic commits + PR with aggregated report |

### Audit Commands (Project-Wide)

| Command | What it does |
|---------|-------------|
| `/forja:audit:backend` | Full backend performance audit: N+1, missing indexes, memory leaks, concurrency, architecture — 3 parallel agents |
| `/forja:audit:frontend` | Full frontend performance audit: auto-routes to Next.js 5-layer or generic 11-category analysis — 3 parallel agents |
| `/forja:audit:database` | Full database audit: MongoDB, PostgreSQL, or MySQL — indexes, queries, modeling, config — 3 parallel agents |
| `/forja:audit:security` | Full AppSec audit: OWASP Top 10, CWE mapping, A-F score, PoC for critical/high — 4 parallel agents |
| `/forja:audit:run` | Run all applicable audits in parallel based on project type; consolidated PASS/WARN/FAIL report |

**Pipeline phases** (`/forja:perf`, `/forja:security`) analyze only the current diff — fast and task-scoped.
**Audit commands** analyze the entire codebase — run them periodically or before releases.

**Every command works standalone** — run `/forja:security` on its own to scan your current diff, or `/forja:audit:security` for a project-wide deep dive.

---

## Parallelism

Forja maximizes Claude Code's Agent tool for parallel execution:

| Phase | Agents | What runs in parallel |
|-------|--------|----------------------|
| Spec | 2 | Linear data fetch + codebase exploration |
| Develop | N | One agent per independent module |
| Test | 3 | Unit + integration + e2e tests |
| Quality | 3 | Performance + security + review **(simultaneously)** |
| Perf (diff) | 2 | Backend analysis + frontend analysis |
| Security (diff) | 3 | Injection/input + auth/access + data/config |
| Review | N | One agent per code area (large diffs) |
| audit:backend | 3 | DB+NET / CPU+MEM+CONC / CODE+CONF+ARCH |
| audit:frontend | 3 | Rendering+Boundary / Data+Cache / Bundle+Assets (Next.js path) |
| audit:database | 3 | Modeling+Writes / Index analysis / Queries+Config |
| audit:security | 4 | Injection / Auth+Access / Data+Config / BusinessLogic+Compliance |
| audit:run | N | All applicable audits simultaneously |

---

## Stack Support

Forja is **stack-agnostic**. It detects your project automatically during `/forja:init`:

| Category | Detected Technologies |
|----------|----------------------|
| **Runtime** | Node.js, Python, Go, Rust, Java, Ruby, PHP, .NET |
| **Backend** | NestJS, Express, FastAPI, Django, Flask, Gin, Spring Boot, Rails, Laravel |
| **Frontend** | Next.js, React, Vue, Angular, Svelte, Astro, Nuxt, Remix |
| **Database** | MongoDB, PostgreSQL, MySQL, Redis, SQLite, DynamoDB |
| **Testing** | Vitest, Jest, Mocha, pytest, go test, RSpec, JUnit, Playwright, Cypress |
| **Project type** | Backend, frontend, fullstack, **monorepo** (with workspace detection) |

For **monorepos**, Forja detects workspaces and launches parallel agents per affected workspace — so a change touching `apps/api` and `apps/web` gets separate backend and frontend analysis simultaneously.

---

## Requirements

| Requirement | Required? | Notes |
|-------------|-----------|-------|
| [Claude Code](https://claude.ai/code) | **Yes** | CLI, desktop app, web app, or IDE extension |
| Git repository | **Yes** | Forja uses git diff for analysis |
| [GitHub CLI](https://cli.github.com/) (`gh`) | Recommended | For `/forja:pr` to create PRs |
| [Linear](https://linear.app) MCP | Optional | For issue tracking integration |
| PostgreSQL 16+ | Optional | Required for Harness Engine (persistent state, cost tracking) |
| Node.js 20+ | Optional | Required for Harness Engine binary |
| Docker / Docker Compose | Optional | Easiest way to run PostgreSQL for the Harness |

---

## Examples

### Specify and develop a feature from Linear

```
/forja:spec PROJ-42           # Decompose into tasks, create Linear project
/forja:run PROJ-43             # Work on the first task
/forja:run PROJ-44             # Work on the next task
/forja:pr                      # Ship when ready
```

Forja fetches the issue, creates a full specification with granular tasks, and you develop each one through the quality pipeline.

### Resume an interrupted pipeline (requires Harness)

```bash
# If Claude Code crashed or timed out mid-pipeline:
forja resume <run-id>

# Find the run-id from recent runs:
forja trace --format pretty | head -20
```

### Check what a pipeline run cost

```bash
forja cost --run <run-id>
# Output: phase-by-phase USD breakdown with token counts
```

### View the full trace of a run

```bash
forja trace --run <run-id> --format md --output report.md
```

### Quick security scan on current changes

```
/forja:security
```

Runs 3 parallel agents scanning for injection, auth/access control, and data exposure issues in your current diff.

### Performance check before shipping

```
/forja:perf
```

Detects if your project is backend, frontend, fullstack, or monorepo and runs the appropriate analysis — N+1 queries, missing indexes, bundle size, re-renders, and more.

### Project-wide audit before a release

```
/forja:audit:run
```

Reads `forja/config.md`, determines your project type, and launches all applicable audits in parallel — backend performance, database, frontend performance, and security. Produces a consolidated PASS/WARN/FAIL report. Critical and high findings are automatically created as Linear issues (if Linear is connected).

### Targeted deep audits

```
/forja:audit:security    # Full AppSec audit — OWASP Top 10, A-F score, PoC for each critical/high
/forja:audit:database    # Index analysis, N+1 queries, schema anti-patterns (MongoDB/PostgreSQL/MySQL)
/forja:audit:frontend    # Core Web Vitals, bundle size, rendering strategy (auto-routes for Next.js)
```

---

## Contributing

Contributions are welcome! The slash commands are plain markdown files — no build step required to work on them.

1. Fork the repo
2. Edit or add command files in `commands/forja/`
3. Test in a real project: `npm run build && forja setup` from the repo root
4. Open a PR

For Harness Engine contributions (TypeScript):

```bash
npm install
npm run dev        # tsx watch mode
npm run typecheck  # type check
npm test           # run tests
npm run build      # compile to bin/forja
```

---

## License

[MIT](LICENSE) — livertonoliveira
