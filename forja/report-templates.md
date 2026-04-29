# Forja — Report Templates

Canonical source for all reporting templates used across Forja command files.
Import by reference: `See forja/report-templates.md#<anchor>`.

---

## Finding Entry {#finding-entry}

Base template. All domains share this structure.

```markdown
### [SEVERITY] <Descriptive Title>
- **Category:** <domain-specific — see extensions below>
- **File:** <path>:<line>
- **Description:** <what the problem is>
- **Impact:** <estimated impact>
- **Suggestion:** <specific fix with code example if helpful>
```

> For severity definitions per domain (critical / high / medium / low), see [`forja/patterns/severity.md`](patterns/severity.md).

### Domain extensions

Fields that **replace or add to** the base template per domain:

**Performance pipeline** (`perf.md`) — categories: `DB | ALGO | MEM | NET | BUNDLE | RENDER | ARCH`
> No extra fields. Uses base template as-is.

**Security pipeline** (`security.md`) — categories: `INJ | AUTH | AUTHZ | DATA | CFG | LOGIC`
```markdown
- **OWASP:** <e.g., A01:2021 Broken Access Control>                   # adds
- **CWE:** <e.g., CWE-639 Authorization Bypass Through User-Controlled Key>  # adds
- **Vector:** <how this could be exploited — 1-2 sentences>           # replaces Description
- **Impact:** <what an attacker would gain>                            # keeps (same field, specific guidance)
- **Proof of Concept:** <example malicious request/payload when applicable>  # adds
- **Fix:** <specific code change with example>                         # replaces Suggestion
```

**Code Review pipeline** (`review.md`) — categories: `SOLID-S | SOLID-O | SOLID-L | SOLID-I | SOLID-D | DRY | KISS | CLEAN | CONSISTENCY | TEST`
```markdown
- **Principle:** <SOLID-* | DRY | KISS | CLEAN | CONSISTENCY | TEST>  # replaces Category
- **Problem:** <what's wrong and why it matters>                      # replaces Description
```

**Frontend audit** (`audit/frontend.md`) — categories: `NET | BUNDLE | LOAD | RENDER | JS | HYDRAT | IMG | FONT | MEM | 3P | ARCH`
(Next.js: `STRATEGY | BOUNDARY | CACHE | BUNDLE | STREAMING | IMG | FONT | MIDDLEWARE | BUILD | COLD | ARCH`)
```markdown
- **Metric affected:** LCP | INP | CLS | FCP | TTFB | TBT | First Load JS | Bundle size  # adds
- **Effort:** <Hours | Days | Weeks>                                   # adds
```

**Backend audit** (`audit/backend.md`) — categories: `DB | NET | CPU | MEM | CONC | CODE | CONF | ARCH`
```markdown
- **Effort:** <Hours | Days | Weeks>                                   # adds
- **Maintenance window:** <Yes | No>                                   # adds
```

**Security audit** (`audit/security.md`) — categories: `INJ | AUTH | AUTHZ | DATA | CFG | LOGIC | DEPS | PRIV`
```markdown
- **OWASP:** <e.g., A01:2021 Broken Access Control>                   # adds
- **CWE:** <e.g., CWE-639>                                            # adds
- **Vector:** <how this could be exploited — 1-2 sentences>           # replaces Description
- **Impact:** <what an attacker or data breach would yield>            # keeps
- **Proof of Concept:** <example malicious request/payload for critical/high findings>  # adds
- **Fix:** <specific code change with example using the project's patterns>  # replaces Suggestion
- **Effort:** <Hours | Days | Weeks>                                   # adds
- **Urgent deploy:** <Yes | No>                                        # adds
```

**Database audit** (`audit/database.md`) — categories: `MDL | IDX | QRY | WRT | CFG | SCH | PERF`
```markdown
- **Collection/Table:** <name(s) affected>                             # adds (before File)
- **Effort:** <Hours | Days | Weeks>                                   # adds
- **Requires migration:** <Yes | No>                                   # adds
```

---

## Finding JSON Schema {#finding-schema}

Base schema. Applies to all domains.

```json
{
  "severity": "critical|high|medium|low",
  "category": "<domain-specific>",
  "filePath": "src/path/to/file.ts",
  "line": 42,
  "title": "...",
  "description": "...",
  "suggestion": "..."
}
```

### Schema extensions by domain

**Security pipeline / Security audit** — additional fields:
```json
{
  "owasp": "A03:2021 Injection",
  "cwe": "CWE-89"
}
```

**Frontend audit** — additional fields:
```json
{
  "metricAffected": "LCP|INP|CLS|FCP|TTFB|TBT|First Load JS|Bundle size",
  "effort": "Hours|Days|Weeks"
}
```

**Backend audit** — additional fields:
```json
{
  "effort": "Hours|Days|Weeks",
  "maintenanceWindow": true
}
```

**Database audit** — additional fields:
```json
{
  "collectionOrTable": "<name>",
  "effort": "Hours|Days|Weeks",
  "requiresMigration": true
}
```

---

## Quality Report {#quality-report}

Consolidated from `homolog.md`. Used in both Linear mode (as issue comment) and Local mode (as `report-<task-id>.md`).

```markdown
# Quality Report — <Feature / Task Title>

## Summary
| Phase | Gate | Critical | High | Medium | Low |
|-------|------|----------|------|--------|-----|
| Performance | PASS/WARN/FAIL | 0 | 0 | 0 | 0 |
| Security | PASS/WARN/FAIL | 0 | 0 | 0 | 0 |
| Code Review | PASS/WARN/FAIL | 0 | 0 | 0 | 0 |

## Performance Findings
<findings in Finding Entry format, or "No findings.">

## Security Findings
<findings in Finding Entry format, or "No findings.">

## Code Review Findings
<findings in Finding Entry format, or "No findings.">

## Fixes Applied
<list of fixes applied automatically during the pipeline, or "None.">

## Homologation
- [ ] User has reviewed all changes
- [ ] User has verified acceptance criteria
- [ ] User approves for PR
```

---

## Acceptance Report {#acceptance-report}

Consolidated from `homolog.md`. Presented to the user during the acceptance phase.

```markdown
## Acceptance Report — <Feature / Task Title>

### What was implemented
<3-5 bullet points summarizing what was built>

### Technical decisions
<Key decisions from the Design document>

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

### Pending warnings
<Medium-level findings accepted by the user, or "None.">

### Acceptance criteria — Manual verification
<From the issue/proposal — for the user to check off>
- [ ] Criterion 1
- [ ] Criterion 2
```

---

## PR Body Template {#pr-body}

Extracted from `pr.md`. Used by `/forja:pr` to build the pull request description via `gh pr create`.

```markdown
## Summary
<From Proposal: why this change was made — 2-3 sentences>

## Changes
<From Design: architecture overview + key technical decisions>

### Files Changed
<From Design: files created and modified>

## Test Results
| Type | Count | Status |
|------|-------|--------|
| Unit | <n> | Passing |
| Integration | <n> | Passing |
| E2E | <n> | Passing / N/A |

## Quality Gates
| Phase | Gate | Critical | High | Medium | Low |
|-------|------|----------|------|--------|-----|
| Performance | <gate> | 0 | 0 | 0 | 0 |
| Security | <gate> | 0 | 0 | 0 | 0 |
| Code Review | <gate> | 0 | 0 | 0 | 0 |

## Warnings
<Medium-level findings accepted during homologation, or "No warnings.">

## Test Plan
<From acceptance criteria — for PR reviewer to verify>
- [ ] Criterion 1
- [ ] Criterion 2

---
Generated by **Forja** | Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

## Report Summary Table {#report-summary}

Compact summary block used at the end of `/forja:perf`, `/forja:security`, `/forja:review`, and all `/forja:audit:*` reports.

```markdown
## Summary
- Critical: X
- High: X
- Medium: X
- Low: X
- **Gate: PASS | WARN | FAIL**
```
