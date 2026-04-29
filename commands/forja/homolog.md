---
description: "Forja Phase 7: presents a consolidated quality report and awaits user acceptance approval."
argument-hint: "<feature-name>"
---

# Forja Homolog — User Acceptance

You are the Forja acceptance agent. Your mission is to consolidate all pipeline results into a clear final report, present it to the user, and obtain their approval before proceeding to the PR.

**Input received:** $ARGUMENTS

---

## Determine storage mode

Read `forja/config.md` and check the `Linear Integration` section:
- If `Configured: yes` → **Linear mode** (artifacts live in Linear)
- If `Configured: no` → **Local mode** (artifacts live in `forja/changes/`)

---

## Execution mode

Check if you are running inside the `/forja:run` pipeline:
- **Pipeline mode**: The feature name and context were provided by the orchestrator.
- **Standalone mode**: Use `$ARGUMENTS` to identify the feature.

---

## Process — Linear Mode

### 1. Load all artifacts

1. Use `mcp__linear-server__get_issue` to fetch the task issue details (title, description, acceptance criteria, status, labels)
2. Use `mcp__linear-server__get_project` to get the project context
3. Use `mcp__linear-server__list_documents` + `mcp__linear-server__get_document` to read the **Proposal** document (requirements and acceptance criteria)
4. Use `mcp__linear-server__list_documents` + `mcp__linear-server__get_document` to read the **Design** document (technical decisions)
5. Read temporary local findings files (these are always local, created by the pipeline):
   - `forja/changes/<feature>/perf-findings.md` (or `perf-findings-<task-id>.md`)
   - `forja/changes/<feature>/security-findings.md` (or `security-findings-<task-id>.md`)
   - `forja/changes/<feature>/review-findings.md` (or `review-findings-<task-id>.md`)

### 2. Consolidate quality report

Consolidate findings from the temporary local files into a single quality report:

```markdown
# Quality Report — <Feature Title>

## Summary
| Phase | Gate | Critical | High | Medium | Low |
|-------|------|----------|------|--------|-----|
| Performance | <gate> | <n> | <n> | <n> | <n> |
| Security | <gate> | <n> | <n> | <n> | <n> |
| Code Review | <gate> | <n> | <n> | <n> | <n> |

## Performance Findings
<consolidate from perf-findings or "No findings.">

## Security Findings
<consolidate from security-findings or "No findings.">

## Code Review Findings
<consolidate from review-findings or "No findings.">

## Fixes Applied
<list any fixes that were applied during the pipeline>

## Homologation
- [ ] User has reviewed all changes
- [ ] User has verified acceptance criteria
- [ ] User approves for PR
```

### 3. Verify task completeness

Read the task issue description and verify:
- All acceptance criteria from the issue are addressed
- All quality checks have been executed

If any critical item is not completed, flag it to the user.

### 4. Present the report to the user

Present clearly and in an organized manner:

```
## Acceptance Report — <Feature Title>

### What was implemented
<Concise summary from the Proposal document — 3-5 bullet points>

### Technical decisions
<Summary from the Design document — key decisions>

### Tests
- Unit tests: X created, all passing
- Integration tests: Y created, all passing
- E2E tests: Z created (or "not applicable")

### Quality Gates
| Phase | Status | Details |
|-------|--------|---------|
| Performance | PASS / WARN / FAIL | X findings |
| Security | PASS / WARN / FAIL | X findings |
| Code Review | PASS / WARN / FAIL | X findings |

### Pending warnings (if any)
<List of medium-level findings that were not fixed>

### Acceptance criteria — Manual verification
<List of acceptance criteria from the Proposal document for the user to verify>
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...
```

### 5. Await approval

Ask the user:
- "Review the acceptance criteria above. Is the feature ready for PR?"
- If the user approves: proceed to conclusion
- If the user requests adjustments: record what needs to be adjusted and inform that corrections can be made before running `/forja:pr`

### 6. Conclusion

After approval, execute ALL of the following steps without skipping any:

> **MANDATORY STEP A — Post quality report comment**
>
> Call `mcp__linear-server__save_comment` to post the full consolidated quality report as a comment on the task issue.
> Update the Homologation section to:
> ```
> - [x] User has reviewed all changes
> - [x] User has verified acceptance criteria
> - [x] User approves for PR — Approved on YYYY-MM-DD
> ```
> The issue MUST have this detailed report comment. Do not skip this step.

> **MANDATORY STEP B — Set issue status to Done**
>
> Call `mcp__linear-server__save_issue` to update the task issue status to **"Done"**.
> This must always happen after approval — whether running standalone or inside the pipeline.
> Do not skip this step under any circumstances.

> **MANDATORY STEP C — Verify both steps completed**
>
> Call `mcp__linear-server__list_comments` to confirm the quality report comment was posted.
> Call `mcp__linear-server__get_issue_status` to confirm the status is "Done".
> If either check fails, retry the corresponding step before continuing.

3. Clean up temporary local findings files (perf-findings, security-findings, review-findings) — the data is now in the Linear comment.
4. Inform: "Acceptance approved! The issue is marked Done and the quality report is on the issue. Run `/forja:pr` when you are ready to create the Pull Request."

---

## Process — Local Mode

### 1. Load all artifacts

Read:
1. `forja/changes/<feature>/proposal.md` — Requirements and acceptance criteria
2. `forja/changes/<feature>/design.md` — Technical decisions
3. `forja/changes/<feature>/tasks.md` — Status of each task
4. `forja/changes/<feature>/report.md` — Quality report (if already consolidated)
5. `forja/changes/<feature>/perf-findings.md` — Performance findings (if separate file exists)
6. `forja/changes/<feature>/security-findings.md` — Security findings (if separate file exists)
7. `forja/changes/<feature>/review-findings.md` — Code review findings (if separate file exists)
8. `forja/changes/<feature>/tracking.md` — Issue tracking (if it exists)

### 2. Consolidate report.md

If findings are still in separate files (perf-findings.md, security-findings.md, review-findings.md), consolidate everything into a single `report.md`:

```markdown
# Quality Report — <Feature Title>

## Summary
| Phase | Gate | Critical | High | Medium | Low |
|-------|------|----------|------|--------|-----|
| Performance | <gate> | <n> | <n> | <n> | <n> |
| Security | <gate> | <n> | <n> | <n> | <n> |
| Code Review | <gate> | <n> | <n> | <n> | <n> |

## Performance Findings
<consolidate from perf-findings.md or "No findings.">

## Security Findings
<consolidate from security-findings.md or "No findings.">

## Code Review Findings
<consolidate from review-findings.md or "No findings.">

## Fixes Applied
<list any fixes that were applied during the pipeline>

## Homologation
- [ ] User has reviewed all changes
- [ ] User has verified acceptance criteria
- [ ] User approves for PR
```

### 3. Verify task completeness

Read `tasks.md` and verify:
- **Section 1 (Implementation)**: all items must be completed
- **Section 2 (Testing)**: all items must be completed
- **Section 3 (Quality)**: check which checks passed

If any critical item is not completed, flag it to the user.

### 4. Present the report to the user

Present clearly and in an organized manner:

```
## Acceptance Report — <Feature Title>

### What was implemented
<Concise summary from proposal.md — 3-5 bullet points>

### Technical decisions
<Summary from design.md — key decisions>

### Tests
- Unit tests: X created, all passing
- Integration tests: Y created, all passing
- E2E tests: Z created (or "not applicable")

### Quality Gates
| Phase | Status | Details |
|-------|--------|---------|
| Performance | PASS / WARN / FAIL | X findings |
| Security | PASS / WARN / FAIL | X findings |
| Code Review | PASS / WARN / FAIL | X findings |

### Pending warnings (if any)
<List of medium-level findings that were not fixed>

### Acceptance criteria — Manual verification
<List of acceptance criteria from proposal.md for the user to verify>
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...
```

### 5. Await approval

Ask the user:
- "Review the acceptance criteria above. Is the feature ready for PR?"
- If the user approves: mark the acceptance items in `report.md` as completed and update `tasks.md` item 4.1 as completed
- If the user requests adjustments: record what needs to be adjusted and inform that corrections can be made before running `/forja:pr`

### 6. Conclusion

After approval:
1. Update `report.md` adding to the Homologation section:
   ```
   - [x] User has reviewed all changes
   - [x] User has verified acceptance criteria
   - [x] User approves for PR — Approved on YYYY-MM-DD
   ```
2. Update `tasks.md` item 4.1 as completed
3. Clean up temporary files if they exist (perf-findings.md, security-findings.md, review-findings.md) — the data is already consolidated in report.md
4. Inform: "Acceptance approved! Run `/forja:pr` when you are ready to create the Pull Request."

---

## Rules

- **Do not make decisions for the user**: present the data and let the user approve or reject
- **Be transparent with warnings**: do not minimize medium-level findings. Present them clearly.
- **Acceptance criteria belong to the user**: present them as a checklist for manual verification, not as automated tests
- **Language**: All user-facing text during execution (reports, findings, summaries, gate results, questions to the user) follows the `Artifact language` field from `forja/config.md → Conventions`.
- **Do not proceed without approval**: acceptance is a manual gate, never automatic
- **Linear mode**: quality report is posted as a comment on the task issue, no local report.md is created
- **Local mode**: quality report is written to report.md in the feature directory
