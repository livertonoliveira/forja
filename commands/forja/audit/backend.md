---
description: "Forja Audit: project-wide backend performance audit. Detects stack from config and launches 3 parallel agents."
argument-hint: ""
---

# Forja Audit — Backend Performance

The backend audit is implemented as a TypeScript module at `src/audits/backend/index.ts`.
This file is a reference document. For diff-scoped analysis, use `/forja:perf` instead.

## Invocation

**CLI:** `forja audit:backend`

**Programmatic:**
```typescript
import { backendAuditModule } from 'src/audits/backend/index.ts';
const report = await backendAuditModule.run(config);
```

## Heuristics

| ID | Heuristic | Description |
|----|-----------|-------------|
| H1 | **N+1 Queries** | DB calls inside loops — `.find()` / `.findOne()` within `.map()` / `.forEach()` |
| H2 | **Missing Cache** | Repeated fetches of static or slowly-changing data with no cache layer |
| H3 | **Pessimistic Locks** | Long-held or broad locks where optimistic concurrency would suffice |

## Supported Frameworks

NestJS, Express, Fastify, FastAPI, Rails.
Stack is auto-detected from `forja/config.md`; checks and fixes adapt accordingly.

## Output

Reports validate against `AuditReportSchema` (REQ-09, defined in `src/audits/index.ts`).
Gate rules: `critical`/`high` → **FAIL** · `medium` → **WARN** · `low`/none → **PASS**.

- **Linear mode:** creates a dedicated project, document, milestones, and issues automatically.
- **Local mode:** writes to `forja/audits/backend-<YYYY-MM-DD>.md`.
- **Language**: All user-facing text during execution (reports, summaries, gate results, status updates) follows the `Artifact language` field from `forja/config.md → Conventions`.

## Tests

`src/audits/backend/__tests__/`
