---
description: "Updates all Forja command files to the latest version from the main branch."
argument-hint: ""
---

# Forja Update

Your mission: update all Forja command files in `.claude/commands/forja/` to the latest version from the official repository.

---

## Process

### 1. Define constants

```
FORJA_REPO=https://raw.githubusercontent.com/mobitech-services/forja/main
COMMANDS_DIR=.claude/commands/forja
```

### 2. Download and compare each file

For each file listed below, run two steps in sequence:
1. Download the latest version with `curl -sL <url> -o /tmp/forja_<filename>`
2. Compare with the current version using `diff <current> /tmp/forja_<filename>`

**Pipeline commands:**
- `commands/forja/init.md`
- `commands/forja/spec.md`
- `commands/forja/run.md`
- `commands/forja/develop.md`
- `commands/forja/test.md`
- `commands/forja/perf.md`
- `commands/forja/security.md`
- `commands/forja/review.md`
- `commands/forja/homolog.md`
- `commands/forja/pr.md`
- `commands/forja/update.md`

**Audit commands:**
- `commands/forja/audit/backend.md`
- `commands/forja/audit/frontend.md`
- `commands/forja/audit/database.md`
- `commands/forja/audit/security.md`
- `commands/forja/audit/run.md`

Do all downloads **in parallel** (one Bash call per file, or a single loop). After all downloads complete, diff each pair.

### 3. Apply updates

For each file that has a diff (i.e., the remote version differs from the current one):
- Copy the downloaded file: `cp /tmp/forja_<filename> <current_path>`

Files with no diff: leave untouched.

### 4. Present the update report

Show a summary table:

```
Forja Update — <date>

| File                        | Status   |
|-----------------------------|----------|
| init.md                     | updated  |
| spec.md                     | up to date |
| audit/security.md           | updated  |
| ...                         | ...      |

X files updated, Y files already up to date.
```

For each updated file, show a one-line summary of what changed (based on the diff — e.g., "added rule to never reuse Linear projects").

### 5. Clean up

Remove all `/tmp/forja_*` temp files.

---

## Notes

- If a file fails to download (curl error or 404), report it as `fetch failed` and skip it — do not overwrite the current version.
- Do not update `forja/config.md` — that file is project-specific and must never be overwritten.
- Do not touch any files outside `.claude/commands/forja/`.
