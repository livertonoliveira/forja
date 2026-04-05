---
description: "Full development pipeline for a task: develop → test → perf → security → review → homolog. Works on 1 task by default, or N tasks / entire project if requested."
argument-hint: "<task-id | linear-issue-id | --project project-name>"
---

# Forja Dev — Development Pipeline

You are the main Forja development orchestrator. Your mission is to take a task (from Linear or markdown) and drive it through the full development pipeline: implementation → testing → quality checks → user acceptance. You maximize the use of parallel agents at every stage.

**Input received:** $ARGUMENTS

---

## Prerequisites

### 1. Check initialization

Check if `forja/config.md` exists at the project root.
- If it does NOT exist: inform the user they need to run `/forja:init` first and STOP.

### 2. Check for specification

Check if `forja/changes/` contains any feature folders with a `proposal.md` and `design.md`.
- If none exist: inform the user they should run `/forja:spec` first to create a specification.
- Exception: if the user provides a Linear issue ID directly, you can proceed (the task details come from Linear).

---

## Detect input mode

Analyze `$ARGUMENTS` to determine what to work on:

### Single task (default, recommended)
- **Linear issue ID** (e.g., `ABC-123`): Work on this specific task. Fetch details via `mcp__linear-server__get_issue`.
- **Local task ID** (e.g., `TASK-001`): Find the task in `forja/changes/<feature>/tasks.md`.

### Multiple tasks
- **`--project <name>`**: Work through ALL pending tasks in the specified project/feature, one at a time, in milestone order.
- **`--milestone <name>`**: Work through all pending tasks in a specific milestone.
- **Multiple IDs** (e.g., `ABC-123 ABC-124 ABC-125`): Work on these specific tasks in order.

**Default behavior**: Work on **1 task at a time**. After completing each task, ask the user: "Task complete. Continue to the next task, or stop here?"

---

## Pipeline Execution (per task)

For each task, execute the following phases:

### 1. Load task context

Read the task details:
- **From Linear**: Use `mcp__linear-server__get_issue` to get title, description, acceptance criteria, labels, milestone
- **From markdown**: Read the task section from `forja/changes/<feature>/tasks.md`

Also read:
- `forja/config.md` — Project stack and conventions
- `forja/changes/<feature>/proposal.md` — Overall feature context (if exists)
- `forja/changes/<feature>/design.md` — Technical decisions (if exists)

Update Linear issue status to "In Progress" (if configured).

### 2. PHASE: Development

Use the **Agent** tool to execute development. Instruct the agent to:

1. Read `.claude/commands/forja/develop.md` for full instructions
2. Use the task description as the implementation spec (not the full feature — just THIS task)
3. Read `forja/config.md` for project conventions
4. Implement the code described in the task
5. Run typecheck (if configured)
6. Verify the change is under 400 lines: run `git diff --stat` and check

**The agent MUST use parallel sub-agents** for independent modules when applicable.

**Line count check**: After development, run `git diff --stat` to verify total lines changed. If it exceeds 400 lines:
- Warn the user: "This task produced ~X lines (target: <400). Consider splitting it."
- Do NOT block — this is a warning, not a gate.

### 3. PHASE: Testing

Use the **Agent** tool to execute tests. Instruct the agent to:

1. Read `.claude/commands/forja/test.md` for full instructions
2. Use the task's acceptance criteria to guide test generation
3. Generate and run tests scoped to THIS task only

**The agent MUST launch 3 sub-agents in parallel**: unit tests, integration tests, e2e tests.

If any test fails after fix attempts:
- The pipeline STOPS. Inform the user.
- Ask if they want an automatic fix attempt.

### 4. PHASES: Quality Checks (PARALLEL)

Launch **3 agents in parallel** using the Agent tool in a SINGLE call:

**Agent 1 — Performance:**
- Read `.claude/commands/forja/perf.md` for full instructions
- Analyze the diff for this task only
- Write findings to `forja/changes/<feature>/perf-findings-<task-id>.md`

**Agent 2 — Security:**
- Read `.claude/commands/forja/security.md` for full instructions
- Analyze the diff for this task only
- Write findings to `forja/changes/<feature>/security-findings-<task-id>.md`

**Agent 3 — Code Review:**
- Read `.claude/commands/forja/review.md` for full instructions
- Analyze the diff for this task only
- Write findings to `forja/changes/<feature>/review-findings-<task-id>.md`

### 5. GATE CHECK

After all 3 agents complete, read the findings and evaluate:

**Gate rules:**
| Condition | Gate |
|-----------|------|
| Any `critical` or `high` finding | **FAIL** |
| Any `medium` finding | **WARN** |
| Only `low` or no findings | **PASS** |

**If FAIL:**
1. Present the critical/high findings to the user
2. Create tracking issues:
   - **With Linear:** Create sub-issues linked to the current task via `mcp__linear-server__save_issue` with rich descriptions (Context, What to do, Acceptance Criteria)
   - **Without Linear:** Record in `forja/changes/<feature>/tracking.md`
3. Ask: "I found issues that need fixing. Would you like me to apply the fixes automatically?"
4. If yes: launch an Agent to fix, then re-run ONLY the phases that failed
5. If no: pause and let the user fix manually

**If WARN:**
1. Present warnings
2. Ask: "There are warnings. Fix now or proceed to acceptance?"
3. If fix: same flow as FAIL
4. If proceed: continue

**If PASS:**
Continue automatically.

### 6. PHASE: User Acceptance

Use the **Agent** tool to execute acceptance. Instruct the agent to:

1. Read `.claude/commands/forja/homolog.md` for full instructions
2. Consolidate findings into `forja/changes/<feature>/report-<task-id>.md`
3. Present the report for this task
4. Wait for user approval

### 7. Task completion

After acceptance:
1. Clean up temporary findings files for this task
2. Mark the task as completed:
   - **Linear:** Update issue status to "Done" via `mcp__linear-server__save_issue`
   - **Markdown:** Mark the task as `done` in `tasks.md`
3. If working on multiple tasks: ask "Task '<name>' complete. Continue to the next task '<next-name>', or stop here?"
4. If single task or user stops: inform "Task complete! Run `/forja:pr` when ready to create a Pull Request."

---

## Multi-task mode

When working on multiple tasks (`--project`, `--milestone`, or multiple IDs):

1. Sort tasks by milestone order, then by dependency order within each milestone
2. Process one task at a time through the full pipeline
3. After each task completion, ask the user before continuing
4. Each task gets its own quality report (`report-<task-id>.md`)
5. At the end, present a summary of all completed tasks

**Never process multiple tasks in parallel** — each task modifies code, so they must be sequential to avoid conflicts.

---

## Orchestrator Rules

- **1 task at a time by default**: Only work on multiple tasks if the user explicitly requests it.
- **Parallelism within phases is mandatory**: Phases 4+5+6 ALWAYS run in parallel. Tests use 3 parallel agents.
- **Quality gates are non-negotiable for FAIL**: Critical/high findings MUST be resolved.
- **Line count awareness**: Warn (don't block) if a task exceeds 400 lines.
- **Linear is optional**: If not configured, all tracking goes to markdown. Never fail because of missing Linear.
- **Do not create the PR automatically**: The pipeline ends at acceptance. The user runs `/forja:pr` separately.
- **Each agent reads its command file**: This ensures each phase follows its own detailed instructions.
- **State persists in files**: If the session breaks, state is in the forja/ artifacts and can be resumed.
