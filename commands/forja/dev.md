---
description: "Full development pipeline: from issue to user acceptance. Executes intake, develop, test, perf, security, review, and homolog with gates and continuous tracking."
argument-hint: "<linear-url | issue-id | free text description>"
---

# Forja Dev — Full Development Pipeline

You are the main Forja orchestrator. Your mission is to drive the full development pipeline, from requirements extraction to user acceptance, maximizing the use of parallel agents and ensuring quality at every stage.

**Input received:** $ARGUMENTS

---

## Prerequisites

### 1. Check initialization

Check if `forja/config.md` exists at the project root.
- If it does NOT exist: inform the user they need to run `/forja:init` first and STOP.

### 2. Check for existing pipeline

Check if there is any folder in `forja/changes/` (excluding `archive/`) that contains a `tasks.md` with pending items (unchecked checkboxes).
- If one exists: inform the user and ask: "In-progress feature '<name>' found. Resume where it left off or start a new feature?"
- If resume: identify the last completed phase by the tasks.md checkboxes and continue from the next one.
- If new: proceed normally.

### 3. Detect input type

Analyze `$ARGUMENTS`:
- If it contains `linear.app` — it is a **Linear URL**. Extract the issue ID.
- If it matches `^[A-Z]+-\d+$` — it is a **Linear issue ID** (e.g., ABC-123).
- Otherwise — it is **free text** describing the feature/fix.

### 4. Derive feature name

From the input, derive a kebab-case name for the feature folder:
- If Linear: use the issue ID + short title (e.g., `abc-123-add-health-check`)
- If free text: derive from the text (e.g., `add-health-check-endpoint`)

Create the folder: `forja/changes/<feature-name>/`

---

## Pipeline Execution

### PHASE 1 — Intake

Use the **Agent** tool to execute the intake. Instruct the agent to:

1. Read the file `.claude/commands/forja/intake.md` to understand the full instructions
2. Use as input: the processed argument (Linear URL/ID or free text)
3. Read `forja/config.md` for project context
4. Generate artifacts in `forja/changes/<feature-name>/`:
   - `proposal.md` — Requirements, acceptance criteria, scope
   - `design.md` — Technical decisions, files to create/modify
   - `tasks.md` — Complete checklist

**The agent MUST use parallel sub-agents internally** as described in intake.md.

### PAUSE — User Approval

After intake completes:
1. Read `forja/changes/<feature-name>/proposal.md` and `design.md`
2. Present a summary to the user:
   - Identified requirements
   - Proposed technical decisions
   - Files to create/modify
   - Scope (in/out)
3. Ask: "Is the plan correct? Would you like to adjust anything before starting development?"
4. If the user requests changes: apply them to the artifacts and re-present.
5. Only proceed after explicit approval.

### PHASE 2 — Development

Use the **Agent** tool to execute development. Instruct the agent to:

1. Read `.claude/commands/forja/develop.md` for full instructions
2. Read the feature artifacts: `proposal.md`, `design.md`, `tasks.md`
3. Read `forja/config.md` for project conventions
4. Implement all required code
5. Run typecheck (if configured in config.md)
6. Update `tasks.md` marking implementation items as completed

**The agent MUST use parallel sub-agents** for independent modules when applicable.

If Linear is configured in config.md: update the issue status to "In Progress" via `mcp__linear-server__save_issue`.

### PHASE 3 — Tests

Use the **Agent** tool to execute tests. Instruct the agent to:

1. Read `.claude/commands/forja/test.md` for full instructions
2. Read the feature artifacts: `proposal.md`, `design.md`, `tasks.md`
3. Read `forja/config.md` for test frameworks
4. Generate and run tests

**The agent MUST launch 3 sub-agents in parallel**: unit tests, integration tests, e2e tests.

After completion: read the updated `tasks.md`. If the testing section has items marked with a cross (failing tests):
- The pipeline STOPS. Inform the user about the failing tests.
- Ask if they want an automatic fix attempt.

### PHASES 4 + 5 + 6 — Quality Checks (PARALLEL)

Launch **3 agents in parallel** using the Agent tool in a SINGLE call:

**Agent 1 — Performance:**
- Read `.claude/commands/forja/perf.md` for full instructions
- Read `design.md` + `forja/config.md` for context
- Analyze the diff for performance issues
- Write findings in the Performance section of `forja/changes/<feature-name>/report.md`

**Agent 2 — Security:**
- Read `.claude/commands/forja/security.md` for full instructions
- Read `design.md` for context
- Analyze the diff for vulnerabilities
- Write findings in the Security section of `forja/changes/<feature-name>/report.md`

**Agent 3 — Code Review:**
- Read `.claude/commands/forja/review.md` for full instructions
- Read `design.md` for context
- Analyze the diff for quality principles
- Write findings in the Code Review section of `forja/changes/<feature-name>/report.md`

**IMPORTANT:** The 3 agents write to DIFFERENT sections of the same `report.md`. To avoid conflicts:
- Agent 1 creates `report.md` with the base structure (header + Summary table + all empty sections)
- Agents 2 and 3 fill in their respective sections
- After ALL complete, the orchestrator consolidates by reading the final report.md

**Safer alternative (recommended):** Each agent writes to a separate file:
- Agent 1 → `forja/changes/<feature-name>/perf-findings.md`
- Agent 2 → `forja/changes/<feature-name>/security-findings.md`
- Agent 3 → `forja/changes/<feature-name>/review-findings.md`

After all complete, the orchestrator reads the 3 files and consolidates into `report.md`.

### GATE CHECK

After all 3 agents complete, read the findings from each and evaluate:

**Gate rules:**
| Condition | Gate |
|-----------|------|
| Any `critical` or `high` finding | **FAIL** |
| Any `medium` finding | **WARN** |
| Only `low` or no findings | **PASS** |

**If FAIL:**
1. Present the critical/high findings to the user
2. For each finding, create an issue:
   - **With Linear:** Use `mcp__linear-server__save_issue` to create a detailed sub-issue (with Context, What to do, Acceptance Criteria, Notes)
   - **Without Linear:** Record in `forja/changes/<feature-name>/tracking.md`
3. Ask the user: "I found issues that need to be fixed. Would you like me to apply the fixes automatically?"
4. If yes: launch an Agent to apply the fixes, then re-run ONLY the phases that failed (not the entire pipeline)
5. If no: inform that the pipeline is paused and the user can fix manually and re-run `/forja:dev`

**If WARN:**
1. Present the warnings to the user
2. Ask: "There are warnings that deserve attention. Would you like to fix them now or proceed to acceptance?"
3. If fix: same flow as FAIL
4. If proceed: continue to Phase 7

**If PASS:**
Continue automatically to Phase 7.

### PHASE 7 — User Acceptance

Use the **Agent** tool to execute user acceptance. Instruct the agent to:

1. Read `.claude/commands/forja/homolog.md` for full instructions
2. Read ALL feature artifacts
3. Present the consolidated report to the user
4. Wait for approval

### Conclusion

After user acceptance is approved:
1. Clean up temporary findings files (`perf-findings.md`, `security-findings.md`, `review-findings.md`) if they exist
2. Inform the user: "Pipeline complete! When you are ready, run `/forja:pr` to create the Pull Request."

---

## Orchestrator Rules

- **Parallelism is mandatory**: Never run sequentially what can be parallel. Phases 4+5+6 ALWAYS run in parallel.
- **Each agent is instructed to read the corresponding .md command**: This ensures each phase follows its own detailed instructions.
- **State persists in files**: If the Claude Code session is interrupted, the state is in the MD files and can be resumed.
- **Gates are non-negotiable for FAIL**: Critical/high findings MUST be resolved. Warnings can be accepted by the user.
- **Linear is optional**: If not configured, all tracking goes to `tracking.md`. Never fail due to missing Linear.
- **Do not create the PR automatically**: The pipeline ends at user acceptance. The PR is a separate command (`/forja:pr`).
