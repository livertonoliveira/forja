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

## Storage Modes

Forja operates in two modes based on whether Linear is connected:

### Linear Mode (recommended)
All artifacts live in Linear — zero local files except `forja/config.md`:
- **Proposal & Design** → Linear Documents linked to the project
- **Tasks** → Linear Issues with milestones and labels
- **Quality Reports** → Comments on task issues
- **Tracking** → Linear sub-issues

### Local Mode (fallback)
All artifacts live in `forja/changes/<feature>/` as markdown:
```
forja/
├── config.md                    # Project context (always local)
└── changes/
    ├── <feature-name>/
    │   ├── proposal.md          # Requirements, acceptance criteria, scope
    │   ├── design.md            # Technical decisions, architecture
    │   ├── tasks.md             # Granular tasks (<400 lines each)
    │   ├── report-<task>.md     # Quality reports per task
    │   └── tracking.md          # Issue tracking
    └── archive/                 # Completed features
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
- Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
- Branch naming: `<type>/<issue-id>-<short-description>`

### Stack Agnostic
- Forja works with any stack. The `/forja:init` command detects the project's stack dynamically.
- All analysis commands adapt their checks based on `forja/config.md`.
- Never hardcode stack-specific assumptions — always read from config.

### Integration with Global Skills
- If the user has global performance/security audit skills, reference their methodology but scope analysis to the diff only
- `/forja:pr` can replace the default PR workflow by adding the aggregated quality report
