---
description: "Forja Audit: project-wide database audit. Routes to MongoDB, PostgreSQL, or MySQL methodology based on forja/config.md. 3 parallel agents."
argument-hint: ""
---

# Forja Audit — Database

Delegate entirely to the `databaseAuditModule` TypeScript implementation. This file is a thin routing wrapper — all detection logic, heuristics, and agent prompts live in the module.

## Storage mode

Read `forja/config.md` → `Linear Integration`:
- `Configured: yes` → **Linear mode**
- `Configured: no` → **Local mode**

## Routing table

| `Database` field in config | Module invoked |
|---|---|
| `MongoDB` | `mongodb` module (Part 1 — available) |
| `PostgreSQL` / `MySQL` / `SQLite` | Coming in Part 2 |
| `none` / not set | Warn user: "No database configured in forja/config.md. Update the Database field and re-run." Then stop. |
| Unknown | Warn user and stop. |

## Output

**Local mode:** write report to `forja/audits/database-<YYYY-MM-DD>.md`.

**Linear mode:**
1. Create a new Linear project "Database Audit — <YYYY-MM-DD>" (never reuse existing).
2. Create a Linear Document in that project with the full report.
3. Create severity milestones (Critical / High / Medium / Low) only for levels that have findings.
4. For each finding, create a Linear issue titled `[DB] <title>`, linked to the project and matching milestone, with priority matching severity.

## Gate rules

| Findings present | Gate |
|---|---|
| Any `critical` or `high` | **FAIL** |
| Any `medium` (no critical/high) | **WARN** |
| Only `low` or none | **PASS** |
