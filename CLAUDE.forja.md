# Forja — Development Pipeline Framework

Forja is a set of Claude Code slash commands (`/forja:*`) that automates the complete development pipeline: from issue intake to PR creation, with persistent MD artifacts and continuous tracking.

## Commands

| Command | Purpose |
|---------|---------|
| `/forja:init` | Initialize Forja in a project (run once) |
| `/forja:spec` | Deep specification: requirements, design, granular tasks (<400 lines), Linear project/milestones/issues |
| `/forja:run` | Development pipeline for a task: develop → test → quality → homologation |
| `/forja:develop` | Implement code following project conventions |
| `/forja:test` | Generate and run tests (unit, integration, e2e) |
| `/forja:perf` | Performance analysis of the diff |
| `/forja:security` | OWASP security scan of the diff |
| `/forja:review` | Code review (SOLID, DRY, KISS) |
| `/forja:homolog` | Final report + user homologation |
| `/forja:pr` | Create PR with atomic commits and aggregated quality report |
| `/forja:audit:backend` | Project-wide backend performance audit (3 parallel agents) |
| `/forja:audit:frontend` | Project-wide frontend performance audit (Next.js 5-layer or generic 11-category) |
| `/forja:audit:database` | Project-wide database audit (MongoDB / PostgreSQL / MySQL) |
| `/forja:audit:security` | Project-wide AppSec audit — OWASP Top 10, A-F score, PoC for critical/high |
| `/forja:audit:run` | Run all applicable audits in parallel; consolidated gate report |

## Storage Modes

### With Linear (recommended)
All artifacts live in Linear — no local files except `forja/config.md`:
- Proposal & Design → Linear Documents
- Tasks → Linear Issues (milestones + labels)
- Quality Reports → Comments on issues
- Tracking → Linear sub-issues

### Without Linear (fallback)
Artifacts live locally in `forja/changes/<feature>/`:
```
forja/
├── config.md                    # Project context (always local)
├── changes/<feature>/
│   ├── proposal.md, design.md, tasks.md, report-*.md, tracking.md
└── audits/                      # Project-wide audit reports
    ├── backend-<date>.md, database-<date>.md
    ├── frontend-<date>.md, security-<date>.md
    └── run-<date>.md
```

## Conventions

### Language
- Everything in English: command instructions, generated artifacts, code, commits, PRs

### Parallelism
- Always use the Agent tool to parallelize work
- Never execute sequentially what can be parallel
- Each parallel agent writes to separate files (no race conditions)

### Gates
- `critical` or `high` findings → gate `fail` → pipeline stops
- `medium` findings → gate `warn` → pipeline pauses, asks user
- Only `low` or no findings → gate `pass` → pipeline continues

### Tracking
- With Linear: create detailed sub-issues for each finding, update status continuously
- Without Linear: register everything in `tracking.md` with rich detail (Context, What to do, Acceptance Criteria)

### Commits and PRs
- Follow Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`
- Atomic commits — one logical change per commit
- Never group unrelated changes
- Branch naming: `<type>/<issue-id>-<short-description>`

### Audit vs Pipeline Phases
- **Pipeline phases** (`/forja:perf`, `/forja:security`) are diff-scoped: they analyze only changed code during the development pipeline.
- **Audit commands** (`/forja:audit:*`) are project-wide: they scan the entire codebase for systemic issues. Run them periodically or before releases.
- `/forja:audit:run` launches all applicable audits in parallel and produces a consolidated gate report.

### Stack Agnostic
- Forja works with any stack. The `/forja:init` command detects the project's stack dynamically.
- All analysis commands adapt their checks based on `forja/config.md`.
- Never hardcode stack-specific assumptions — always read from config.
