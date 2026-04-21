# Deprecations

This document tracks all deprecated APIs, options, and behaviours in Forja.

## Policy

- **Minimum window**: a deprecated item must survive at least **2 minor versions** before it can be removed (e.g., deprecated in `1.3.x` → earliest removal in `1.5.0`).
- **Required fields** for every deprecated item:
  - **Alternative**: documented replacement or migration path.
  - **Deprecation date**: calendar date when the deprecation was announced.
  - **Expected removal date / version**: earliest version where the item will be deleted.
- **Runtime warning**: the first call per process session emits a `DeprecationWarning` via `process.emitWarning(...)` and writes a `deprecation_warning` trace event with severity `low`.
- **Suppression**: set `FORJA_SUPPRESS_DEPRECATION_WARNINGS=1` to silence all runtime warnings (useful in tests or scripts that intentionally exercise deprecated paths).
- **Trace events**: written only when `FORJA_RUN_ID` is set to a valid UUID (i.e., inside a Forja run context).

## Security exception

A security breaking fix **may bypass the 2-minor window** when waiting would expose users to an active vulnerability. Requirements:

1. The breaking change must be the minimum necessary to close the vulnerability.
2. The release notes and `CHANGELOG.md` entry must include a direct link to the CVE or security advisory.
3. A migration guide must be published simultaneously with the breaking release.

## Currently deprecated items

| Name | Since | Remove in | Alternative | Deprecation date |
|------|-------|-----------|-------------|-----------------|
| —    | —     | —         | —           | —               |
