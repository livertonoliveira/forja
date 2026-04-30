# Pipeline Profiles

A profile is a named preset that enables or disables pipeline phases in bulk. It is set in `forja/config.md` under `## Pipeline Profile`.

## Available profiles

| Phase | `lite` | `standard` | `strict` |
|-------|:------:|:----------:|:--------:|
| dev | ✓ | ✓ | ✓ |
| test | | ✓ | ✓ |
| perf | | | ✓ |
| security | | | ✓ |
| review | | ✓ | ✓ |
| homolog | | ✓ | ✓ |
| pr | ✓ | ✓ | ✓ |

## Precedence rule

Individual phase overrides in `Pipeline Phases` always take precedence over the profile. The profile only sets the default state of each phase; any `enabled`/`disabled` entry in `Pipeline Phases` overrides that default for that specific phase.

Example: `profile: lite` + `test: enabled` in `Pipeline Phases` → tests run even though `lite` excludes them.

## Usage examples

### Prototype / proof of concept (`lite`)
Fast iteration — only dev and PR, no quality gates.
```
## Pipeline Profile
- profile: lite
```

### Internal library (`standard`)
Balanced coverage — dev, tests, review, and homologation; skip heavy perf/security scans.
```
## Pipeline Profile
- profile: standard
```

### Critical product / external exposure (`strict`)
Maximum quality — all phases enabled, full OWASP and performance scans on every task.
```
## Pipeline Profile
- profile: strict
```
