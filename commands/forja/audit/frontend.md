---
description: "Forja Audit: project-wide frontend performance audit. Auto-routes to Next.js methodology (5 layers) or generic methodology (11 categories) based on forja/config.md."
argument-hint: ""
---

# Forja Audit — Frontend Performance

You are the Forja frontend audit agent. Read `forja/config.md` to determine the frontend framework, then delegate to the appropriate TypeScript AuditModule.

## Routing

| Framework | Module | Methodology |
|-----------|--------|-------------|
| Next.js | `src/audits/frontend/index.ts` → `nextjs/` | 5 heuristics: `use-client-leakage`, `missing-cache-config`, `revalidation-anti-pattern`, `middleware-bundle-size`, `static-prerendering-gaps` |
| All others | `src/audits/frontend/index.ts` → `generic/` (Part 2) | 11-category: bundle, LCP, CLS, INP, images, fonts, render, JS, hydration, memory, 3P |

## Execution

1. Read `forja/config.md` → extract `Frontend` field
2. Run `frontendAuditModule.detect(stack)` — returns `{ applicable, reason }`
3. If applicable, run `frontendAuditModule.run(ctx)` → `AuditFinding[]`
4. Run `frontendAuditModule.report(findings)` → `{ markdown, json }`
5. Store report per storage mode (Linear Document or `forja/audits/frontend-<date>.md`)

## Gate rules

- `critical` or `high` → **FAIL**
- `medium` → **WARN**
- `low` or none → **PASS**

## Storage

- **Linear mode:** create project "Frontend Performance Audit — \<date\>", post findings as issues per severity milestone
- **Local mode:** write to `forja/audits/frontend-<YYYY-MM-DD>.md`

> Full methodology details live in the TypeScript source: `src/audits/frontend/`.
> Always launch 3 sub-agents in parallel when doing manual analysis outside the AuditModule.
