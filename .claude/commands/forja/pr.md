---
description: "Creates a PR with atomic commits and an aggregated quality report. Run after acceptance is approved."
argument-hint: "<feature-name>"
---

# Forja PR — Pull Request Creation

You are the Forja PR agent. Your mission is to create a complete Pull Request with atomic commits, a descriptive branch, and a rich body that aggregates the quality reports from the pipeline.

**Input received:** $ARGUMENTS

---

## Determine storage mode

See @forja/patterns/storage-mode.md.

---

## Execution mode

Identify the feature:
- **Linear mode**: Use `$ARGUMENTS` as a Linear issue ID or project name. If empty, ask the user.
- **Local mode**: If `$ARGUMENTS` specifies a name, use it to find the feature in `forja/changes/`. If empty, look for the most recent feature in `forja/changes/` (excluding `archive/`) that has approved acceptance in `report.md`.

---

## Prerequisites

### 1. Verify acceptance

**Linear mode:**
- Use `mcp__linear-server__get_issue` to fetch the task issue
- Use `mcp__linear-server__list_comments` to find the quality report comment
- Verify the Homologation section in the comment contains:
  ```
  - [x] User approves for PR
  ```
- If NOT: inform the user they need to run `/forja:homolog` first and STOP.

**Local mode:**
- Read `forja/changes/<feature>/report.md` and verify that the Homologation section has:
  ```
  - [x] User approves for PR
  ```
- If NOT: inform the user they need to run `/forja:homolog` first and STOP.

### 2. Verify there are no pending changes

Run `git status` to check the repository state.

---

## Process

### 1. Load artifacts

**Linear mode:**

Follow @forja/patterns/load-artifacts.md, then additionally load:
- Use `mcp__linear-server__list_comments` to read the quality report comment posted during homolog

**Local mode:**

Follow @forja/patterns/load-artifacts.md, then additionally load:
- `forja/changes/<feature>/tasks.md` — To verify completeness
- `forja/changes/<feature>/report.md` — For quality gates and findings

### 2. Create branch

```bash
git checkout -b <branch-name>
```

If already on a branch other than `main`/`master`, use the current branch.

### 3. Atomic commits

Analyze all changes with `git diff` and `git status`:

1. **Identify logical groups** of changes that should be separate commits
2. **Each commit must be atomic**: a single logical change that makes sense on its own
3. **Stage by file**: `git add <files>` (never `git add .` when making multiple commits)

**Suggested commit order:**
1. Infrastructure (types, interfaces, schemas, migrations)
2. Business logic (services, utilities)
3. Presentation layer (controllers, routes, components)
4. Configuration (module registration, route config)
5. Tests
6. Quality adjustments (review fixes, performance fixes)

### 4. Pre-push validation

Run the validations configured in `forja/config.md`:
- Typecheck (if configured)
- Tests (if configured)
- Lint (if configured)

If any validation fails: fix, re-commit, and re-run.

### 5. Push

```bash
git pull --rebase origin main
git push -u origin <branch-name>
```

If there are conflicts during rebase: resolve them. If ambiguous, ask the user for confirmation.

### 6. Create PR

Build the PR body using the artifacts (from Linear documents or local files) and create via `gh pr create`.

Follow @forja/report-templates.md#pr-body for the PR body template.

Use a HEREDOC for the body:
```bash
gh pr create --title "<conventional commit style title>" --body "$(cat <<'EOF'
<body content>
EOF
)"
```

### 7. Update artifacts

**Linear mode:**

> **MANDATORY STEP A — Attach PR URL**
>
> Call `mcp__linear-server__create_attachment` with the PR URL to attach it to the issue.

> **MANDATORY STEP B — Post PR link comment**
>
> Call `mcp__linear-server__save_comment` to post a comment on the issue with the PR URL.
> The comment must include the PR URL and a brief summary (e.g., "PR created: <url>").

> **MANDATORY STEP C — Verify both quality report AND PR link exist on issue**
>
> Call `mcp__linear-server__list_comments` and verify the issue has:
> 1. A quality report comment (posted during homolog — contains the Summary table with Performance/Security/Code Review gates)
> 2. A PR link comment (just posted above)
>
> Both MUST be present. If the quality report comment is missing, it means homolog did not complete properly — warn the user before continuing.
>
> Do NOT change the issue status — it was already set to "Done" during homolog approval.

**Local mode:**
1. Update `tasks.md`: mark item 4.2 (PR created) as completed
2. Update `tasks.md`: mark item 4.3 as completed (if applicable)

### 8. Create GitHub Check

After the PR is created (step 6), post the Forja gate result as a GitHub Check Run so reviewers can see it directly in the PR.

**Steps:**

1. Retrieve the gate decision for the current run:
   ```bash
   forja gate --run $FORJA_RUN_ID
   ```
   Capture the exit code: `0` = pass, `1` = warn, `2` = fail.
   Also capture the counts printed: `critical=N, high=N, medium=N, low=N`.

2. Get the current commit SHA:
   ```bash
   git rev-parse HEAD
   ```

3. Determine owner/repo by calling `getGitRemoteInfo()` from `src/integrations/github-checks.ts`.

4. Call `createCheck()` from `src/integrations/github-checks.ts` with:
   - `owner` / `repo` — from `getGitRemoteInfo()`
   - `sha` — from `git rev-parse HEAD`
   - `name` — `'Forja Quality Gate'`
   - `status` — `'completed'`
   - `conclusion` — `'success'` if exit code 0, `'failure'` if exit code 1 or 2
   - `title` — `Gate: PASS — 0 critical, 0 high` (use actual counts; replace PASS with WARN or FAIL accordingly)
   - `summary` — `See full report at http://localhost:3737/runs/<runId>`
   - `detailsUrl` — `http://localhost:3737/runs/<runId>`

   Where `<runId>` = `$FORJA_RUN_ID`.

> **Note:** If `GITHUB_TOKEN` is not set (in env or config), `createCheck` logs a warning and skips silently — this step never blocks the pipeline.

### 9. Finalize trace

After the PR is created and the URL is known, finalize the run trace:

```bash
forja trace finish --status done --pr-url <pr-url>
```

If `forja` is not found, run via `npx forja trace finish --status done --pr-url <pr-url>`.

This writes the `run_end` event to the trace, links the PR URL, and clears `forja/state/.active-run`. The run will now appear as complete in the dashboard.

> **Note:** If you skip this step, the Stop hook will still close the run automatically when the session ends — but without the PR URL recorded.

### 11. Archive feature (Local mode only)

**Local mode:**
Move the feature folder to the archive:
```bash
mv forja/changes/<feature-name> forja/changes/archive/$(date +%Y-%m-%d)-<feature-name>
```

**Linear mode:**
No local files to archive. Linear artifacts remain in Linear.

### 12. Finalize

Inform the user:
- URL of the created PR
- Number of commits made
- Branch name
- Remind: "Do NOT merge — review the PR and merge manually."

---

## Rules

- **Never merge automatically**: only create the PR
- **Atomic commits**: never group unrelated changes together
- **Conventional Commits**: ALWAYS follow the convention
- **Co-Authored-By**: ALWAYS include in every commit
- **Validation before push**: typecheck and tests must pass
- **Resolve conflicts**: if there are conflicts during rebase, resolve them (ask for confirmation if ambiguous)
- **Never force push**: unless the user explicitly requests it
- **Language**: See @forja/patterns/language.md for language rules.
- **Verify acceptance**: never create a PR without approved acceptance
- **Linear mode**: attach PR URL and post PR link comment — do NOT change issue status (already "Done" from homolog)
- **Local mode**: archive the feature folder after PR creation
