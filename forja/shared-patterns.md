# Forja Shared Patterns — Index

Navigation index for human reference. **Do not reference this file from command files** — include only the specific pattern files you need from `forja/patterns/`.

## Available patterns

| File | Use when | Lines |
|------|----------|-------|
| [`forja/patterns/storage-mode.md`](patterns/storage-mode.md) | Command needs to detect Linear vs Local mode | 5 |
| [`forja/patterns/load-artifacts.md`](patterns/load-artifacts.md) | Command needs to load context artifacts | 12 |
| [`forja/patterns/gates.md`](patterns/gates.md) | Command emits a gate decision (PASS/WARN/FAIL) | 7 |
| [`forja/patterns/severity.md`](patterns/severity.md) | Command classifies findings by severity | 48 |
| [`forja/patterns/parallelism.md`](patterns/parallelism.md) | Command launches parallel agents | 5 |
| [`forja/patterns/language.md`](patterns/language.md) | All commands (language rule) | 4 |
| [`forja/patterns/stack-detection.md`](patterns/stack-detection.md) | Command needs to read or detect the project's stack | 44 |

## Which patterns each command needs

| Command | storage-mode | load-artifacts | gates | severity | parallelism | language | stack-detection |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| develop.md | ✓ | ✓ | | | ✓ | ✓ | |
| test.md | ✓ | ✓ | | | ✓ | ✓ | |
| perf.md | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| security.md | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| review.md | ✓ | ✓ | ✓ | ✓ | | ✓ | |
| homolog.md | ✓ | ✓ | | | | ✓ | |
| run.md | ✓ | ✓ | | | ✓ | ✓ | ✓ |
| pr.md | ✓ | ✓ | | | | ✓ | |
| spec.md | ✓ | ✓ | | | ✓ | ✓ | |
| init.md | | | | | | ✓ | ✓ |
| audit/backend.md | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| audit/frontend.md | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| audit/security.md | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| audit/database.md | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| audit/run.md | ✓ | ✓ | | | ✓ | ✓ | ✓ |
