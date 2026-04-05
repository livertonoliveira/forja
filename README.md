<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Slash_Commands-7C3AED?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTcgMTRsNS01IDUgNSIvPjwvc3ZnPg==" alt="Claude Code">
  <img src="https://img.shields.io/badge/Stack-Agnostic-10B981?style=for-the-badge" alt="Stack Agnostic">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/Linear-Integration-5E6AD2?style=for-the-badge&logo=linear&logoColor=white" alt="Linear Integration">
</p>

<h1 align="center">Forja</h1>

<p align="center">
  <strong>Automated development pipeline for Claude Code.</strong><br>
  From issue to pull request — with quality gates, parallel agents, and persistent artifacts.
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#how-it-works">How it Works</a> ·
  <a href="#stack-support">Stack Support</a>
</p>

---

## What is Forja?

Forja is a framework of [Claude Code](https://claude.ai/code) slash commands that automates your **entire** development workflow:

```
/forja:dev "add user authentication with JWT"
```

That single command orchestrates:

> **Requirements Extraction** → **Implementation** → **Testing** → **Performance Analysis** → **Security Scan** → **Code Review** → **User Acceptance**

Each phase has quality gates. Phases 4-6 run in **parallel**. Everything produces persistent markdown artifacts that serve as durable memory for the LLM.

---

## Quick Start

### 1. Install

```bash
curl -sL https://raw.githubusercontent.com/mobitech-services/forja/main/install.sh | bash
```

### 2. Initialize

```
/forja:init
```

This auto-detects your stack, conventions, test framework, and creates `forja/config.md`.

### 3. Develop

```
/forja:dev "add password reset via email"
```

Or from a Linear issue:

```
/forja:dev ABC-123
```

### 4. Ship

```
/forja:pr
```

Creates atomic commits (Conventional Commits), pushes the branch, and opens a PR with the full quality report.

---

## Installation

### One-line install (recommended)

```bash
curl -sL https://raw.githubusercontent.com/mobitech-services/forja/main/install.sh | bash
```

> **Note:** The repository must be public for this to work. For private repos, use the manual install method below.

### Manual install

```bash
# 1. Clone the repo
git clone https://github.com/mobitech-services/forja.git /tmp/forja

# 2. Copy commands to your project
mkdir -p .claude/commands/forja
cp /tmp/forja/commands/forja/*.md .claude/commands/forja/

# 3. Add Forja config to your CLAUDE.md
cat /tmp/forja/CLAUDE.forja.md >> CLAUDE.md

# 4. Clean up
rm -rf /tmp/forja
```

### Verify

Open Claude Code in your project and type `/forja:init`. If it detects your stack, you're good to go.

---

## How it Works

```
                         ┌──────────────┐
                         │    INPUT     │
                         │ Issue URL,   │
                         │ ID, or text  │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                     ┌───│   INTAKE     │───┐
                     │   │              │   │    2 parallel agents
                 Linear  └──────────────┘  Codebase
                  data                     exploration
                     │                      │
                     └──────────┬───────────┘
                                │
                         proposal.md + design.md + tasks.md
                                │
                         ┌──────▼───────┐
                         │   APPROVE    │  ← You review the plan
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │   DEVELOP    │───── Parallel agents
                         │              │      per module
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                     ┌───│    TEST      │───┐
                     │   │              │   │
                   Unit  └──────────────┘  E2E     3 parallel agents
                     │    Integration    │
                     └────────┼─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
       ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
       │ PERFORMANCE │ │  SECURITY  │ │   REVIEW    │  3 parallel
       │             │ │            │ │             │  agents
       └──────┬──────┘ └─────┬──────┘ └──────┬──────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                       ┌──────▼───────┐
                       │  GATE CHECK  │  fail → fix → re-run
                       │              │  warn → ask user
                       └──────┬───────┘  pass → continue
                              │
                       ┌──────▼───────┐
                       │   ACCEPT     │  ← You verify & approve
                       └──────┬───────┘
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

### Persistent Artifacts

Forja creates a `forja/` directory in your project with durable markdown files:

```
forja/
├── config.md                         # Project context (auto-detected)
└── changes/
    ├── abc-123-add-auth/
    │   ├── proposal.md               # Requirements & acceptance criteria
    │   ├── design.md                 # Architecture & technical decisions
    │   ├── tasks.md                  # Implementation checklist ✅
    │   ├── report.md                 # Quality report (perf + sec + review)
    │   └── tracking.md              # Issue tracking (Linear fallback)
    └── archive/                      # Completed features (post-merge)
        └── 2026-04-04-add-auth/
```

These serve as **durable memory** — if the Claude Code session breaks, all context is preserved. They're also valuable documentation for your project.

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

| Command | Phase | What it does |
|---------|-------|-------------|
| `/forja:init` | Setup | Auto-detect stack, conventions, create `forja/config.md` |
| `/forja:dev` | Full Pipeline | Run all phases from intake to acceptance |
| `/forja:intake` | 1 — Intake | Extract requirements from Linear or free text |
| `/forja:develop` | 2 — Develop | Implement code following project conventions |
| `/forja:test` | 3 — Test | Generate & run unit, integration, and e2e tests |
| `/forja:perf` | 4 — Performance | Analyze diff for N+1 queries, missing indexes, bundle size |
| `/forja:security` | 5 — Security | OWASP scan: injection, auth, data exposure |
| `/forja:review` | 6 — Review | SOLID, DRY, KISS, Clean Code analysis |
| `/forja:homolog` | 7 — Accept | Present quality report for user approval |
| `/forja:pr` | Delivery | Atomic commits + PR with aggregated report |

**Every command works standalone** — run `/forja:security` on its own to scan your current diff, or `/forja:test` to generate tests for recent changes.

---

## Parallelism

Forja maximizes Claude Code's Agent tool for parallel execution:

| Phase | Agents | What runs in parallel |
|-------|--------|----------------------|
| Intake | 2 | Linear data fetch + codebase exploration |
| Develop | N | One agent per independent module |
| Test | 3 | Unit + integration + e2e tests |
| Quality | 3 | Performance + security + review **(simultaneously)** |
| Perf | 2 | Backend analysis + frontend analysis |
| Security | 3 | Injection/input + auth/access + data/config |
| Review | N | One agent per code area (large diffs) |

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

---

## Examples

### Full pipeline from a Linear issue

```
/forja:dev PROJ-42
```

Forja fetches the issue, extracts requirements, implements the feature, generates tests, runs quality checks, and presents a report for your approval.

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

---

## Contributing

Contributions are welcome! Forja is built entirely as markdown command files — no build step, no dependencies.

1. Fork the repo
2. Edit or add command files in `commands/forja/`
3. Test in a real project by copying to `.claude/commands/forja/`
4. Open a PR

---

## License

[MIT](LICENSE) — Mobitech Servicos em TI LTDA
