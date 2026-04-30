---
description: "Forja Audit: meta-command that runs all applicable audits based on forja/config.md project type. Produces a consolidated report."
argument-hint: ""
---

# Forja Audit — Run All

You are the Forja audit orchestrator. Your mission is to determine which audits apply to this project, launch them as parallel agents, and consolidate the results into a unified audit report with a single gate decision.

---

## Determine storage mode

See @forja/patterns/storage-mode.md.

---

## Process

### 1. Load context

Read `forja/config.md` and extract:
- **Project Type** (backend | frontend | fullstack | monorepo)
- **Database** (MongoDB | PostgreSQL | MySQL | none)
- **Frontend** (Next.js | React | Vue | none | etc.)
- **Workspaces** (if monorepo)

### 2. Determine applicable audits

Use this routing table:

| Project Type | Database configured? | Audits to run |
|---|---|---|
| `backend` | yes | audit:backend + audit:database + audit:security |
| `backend` | no | audit:backend + audit:security |
| `frontend` | — | audit:frontend + audit:security |
| `fullstack` | yes | audit:backend + audit:database + audit:frontend + audit:security |
| `fullstack` | no | audit:backend + audit:frontend + audit:security |
| `monorepo` | varies | See monorepo logic below |

**Monorepo logic:**
- Read the `Workspaces` section of `forja/config.md`
- For each workspace classified as `backend`: run `audit:backend` + `audit:security` for that workspace
- For each workspace classified as `frontend`: run `audit:frontend` for that workspace
- If any workspace has a database configured: run `audit:database`
- Always include one `audit:security` covering the full monorepo

### 3. Announce the plan

Before launching agents, output:

```
Running Forja audit suite for <Project Type> project:
- audit:backend    [yes | no]
- audit:frontend   [yes | no]
- audit:database   [yes | no — <DB type>]
- audit:security   [yes]

Launching <N> audits in parallel...
```

### 4. Launch all applicable audits in parallel

Use the **Agent** tool to launch all applicable audit agents **in a SINGLE parallel call**. Each agent should be instructed to run its respective audit command logic:

- **audit:backend agent**: run the full `/forja:audit:backend` analysis (read that command's instructions) and return the findings report
- **audit:database agent**: run the full `/forja:audit:database` analysis and return the findings report
- **audit:frontend agent**: run the full `/forja:audit:frontend` analysis and return the findings report
- **audit:security agent**: run the full `/forja:audit:security` analysis and return the findings report

Each agent writes its own report file:
- `forja/audits/backend-<YYYY-MM-DD>.md`
- `forja/audits/database-<YYYY-MM-DD>.md`
- `forja/audits/frontend-<YYYY-MM-DD>.md`
- `forja/audits/security-<YYYY-MM-DD>.md`

### 5. Consolidate results

After all agents complete, read each report file and produce a consolidated summary.

**Consolidated gate logic:**
- If ANY individual audit gate = **FAIL** → consolidated gate = **FAIL**
- If ANY individual audit gate = **WARN** (and none FAIL) → consolidated gate = **WARN**
- All **PASS** → consolidated gate = **PASS**

### 6. Write consolidated report

**Local mode:** Write to `forja/audits/run-<YYYY-MM-DD>.md`

**Linear mode:**
1. Create a Linear Document titled "Audit Suite — <YYYY-MM-DD>" with the consolidated report
2. Individual audit documents (backend, database, frontend, security) were already created by each agent
3. Link all documents together in the consolidated report

**Consolidated report format:**

```markdown
# Forja Audit Suite — <YYYY-MM-DD>

## Gate Result

**PASS | WARN | FAIL**

## Summary by Audit

| Audit | Critical | High | Medium | Low | Gate |
|-------|----------|------|--------|-----|------|
| Backend Performance | X | X | X | X | PASS/WARN/FAIL |
| Database | X | X | X | X | PASS/WARN/FAIL |
| Frontend Performance | X | X | X | X | PASS/WARN/FAIL |
| Security | X | X | X | X | PASS/WARN/FAIL |
| **TOTAL** | **X** | **X** | **X** | **X** | **PASS/WARN/FAIL** |

## Critical and High Findings (All Audits)

[All critical and high findings from all audits, ordered by severity then audit type]

### [SEVERITY] <Finding Title> — <Audit Type>
- **Category:** ...
- **File:** ...
- **Description:** ...
- **Impact:** ...
- **Suggestion:** ...

## Unified Prioritized Roadmap

| Priority | Finding | Audit | Severity | Effort | Quick win? |
|----------|---------|-------|----------|--------|------------|

## Medium and Low Findings

[Summarized — refer to individual audit reports for full details]

| Finding | Audit | Severity | Effort |
|---------|-------|----------|--------|

## Individual Audit Reports

- Backend: `forja/audits/backend-<YYYY-MM-DD>.md`
- Database: `forja/audits/database-<YYYY-MM-DD>.md`
- Frontend: `forja/audits/frontend-<YYYY-MM-DD>.md`
- Security: `forja/audits/security-<YYYY-MM-DD>.md`
```

### 7. Present results to user

After writing the consolidated report:

1. Show the gate result prominently: **PASS**, **WARN**, or **FAIL**
2. List all `critical` and `high` findings with their audit source
3. Show the unified roadmap
4. If gate = FAIL: "Pipeline is blocked. Resolve critical/high findings before proceeding."
5. If gate = WARN: "Medium findings detected. Review and decide whether to proceed."
6. If gate = PASS: "All audits passed. Codebase is in good shape."

---

## Rules

- **ALWAYS launch all applicable audits in a single parallel call** — never run audits sequentially.
- **Do not skip security**: `audit:security` always runs regardless of project type.
- **Monorepo**: scope each backend/frontend audit to the correct workspace directory; share the security audit across all workspaces.
- **Consolidated gate is pessimistic**: a single FAIL in any audit = overall FAIL.
- **Individual reports are authoritative**: the consolidated report summarizes; individual reports have full details.
- **Language**: See @forja/patterns/language.md.
- **For project-wide diff context**: after running `/forja:audit:run`, individual pipeline phases (`/forja:perf`, `/forja:security`) still run per-task during development. Audits are for periodic project-wide health checks.
