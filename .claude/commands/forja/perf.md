---
description: "Forja Phase 4: performance analysis of the diff. Detects project type (monorepo/backend/frontend) and adapts agents accordingly."
argument-hint: "<feature-name>"
---

# Forja Performance — Performance Analysis

You are the Forja performance agent. Your mission is to analyze the new/modified code in the feature looking for performance issues, adapting the analysis based on the detected project type and stack.

**Input received:** $ARGUMENTS

---

## Determine storage mode

Read `forja/config.md` and check the `Linear Integration` section:
- If `Configured: yes` → **Linear mode** (design context lives in Linear)
- If `Configured: no` → **Local mode** (design context lives in `forja/changes/`)

---

## Execution mode

Check if you are running inside the `/forja:run` pipeline:
- **Pipeline mode**: Read the artifacts and use the feature diff.
- **Standalone mode**: Use `$ARGUMENTS` to identify the feature. If not found, use `git diff` as the analysis source.

---

## Process

### 1. Load context

Read:
1. `forja/config.md` — **Project Type** (backend | frontend | fullstack | monorepo), **Stack**, **Database**

**Linear mode:**
2. Use `mcp__linear-server__list_documents` + `mcp__linear-server__get_document` to read the **Design** document (files created/modified)

**Local mode:**
2. `forja/changes/<feature>/design.md` — Files created/modified

**Both modes:**
3. Run `git diff` to see the full diff of new/modified code

### 2. Determine agent strategy

Based on the **Project Type** from `forja/config.md`, determine how many and which agents to launch:

| Project Type | Agents |
|-------------|---------|
| **backend** | 1 agent: Backend Performance |
| **frontend** | 1 agent: Frontend Performance |
| **fullstack** | 2 parallel agents: Backend + Frontend |
| **monorepo** | N parallel agents: 1 per workspace affected by the diff |

**For monorepo:** Cross-reference the diff files with the workspaces listed in `forja/config.md`. Only launch agents for workspaces that have modified files. Classify each workspace as backend or frontend and apply the corresponding agent.

### 3. Launch agents (in parallel when >1)

Use the **Agent** tool to launch the agents. If more than one, launch them **in parallel in a single call**.

---

### Backend Performance Agent

Analyze ONLY the new/modified code in the diff looking for:

#### Database & Queries
| Issue | What to look for |
|-------|-----------------|
| **N+1 Queries** | Loops containing DB calls, `.find()` inside `.map()/.forEach()`, lazy loading in loops, repeated queries for related data |
| **Missing Indexes** | New query patterns without supporting indexes, queries filtering on fields not indexed, sort operations on non-indexed fields |
| **Full Table Scans** | Queries without filters, `find({})` on large collections, missing `limit()` on potentially large result sets |
| **Inefficient Aggregations** | `$lookup` without index on `foreignField`, `$unwind` on large arrays, missing `$match` before expensive stages |
| **Connection Issues** | Missing connection pooling, connections not returned to pool, connection leaks in error paths |

#### Algorithmic & Memory
| Issue | What to look for |
|-------|-----------------|
| **O(n^2) or worse** | Nested loops over same/related data, `.find()` inside `.filter()`, repeated linear searches |
| **Missing Pagination** | Endpoints returning all records without limit/offset, unbounded query results |
| **Memory Leaks** | Event listeners not cleaned up, growing caches without eviction, large objects held in closures |
| **Blocking Operations** | Synchronous file I/O, CPU-intensive operations on event loop, missing `async/await` on I/O |
| **Unbounded Concurrency** | `Promise.all()` with thousands of items without batching, missing rate limiting on outbound calls |

#### Architecture
| Issue | What to look for |
|-------|-----------------|
| **Missing Caching** | Repeated expensive computations, frequently accessed data without cache layer |
| **Chatty APIs** | Multiple sequential API calls that could be batched, over-fetching data |
| **Missing Compression** | Large response payloads without gzip/brotli |
| **Logging Overhead** | Verbose logging in hot paths, synchronous logging, logging large objects |

**Stack-specific checks (adapt based on forja/config.md Stack):**
- **MongoDB**: Check for missing compound indexes, `$lookup` performance, embedding vs referencing decisions, write concern levels
- **PostgreSQL**: Mental EXPLAIN ANALYZE, missing indexes on foreign keys, N+1 via ORM lazy loading, missing partial indexes
- **MySQL**: Similar to PostgreSQL + check for table locking issues
- **Redis**: Key pattern efficiency, missing TTL, large key values, pipeline usage
- **Any SQL ORM**: Check for eager/lazy loading misuse, raw queries vs ORM queries, transaction scope

---

### Frontend Performance Agent

Analyze ONLY the new/modified code in the diff looking for:

#### Bundle & Loading
| Issue | What to look for |
|-------|-----------------|
| **Heavy Imports** | Importing entire libraries when only a function is needed (e.g., `import _ from 'lodash'` vs `import debounce from 'lodash/debounce'`) |
| **Missing Lazy Loading** | Large components imported statically that could be `lazy()`/`dynamic()` |
| **Missing Code Splitting** | Routes or features that could be split but are bundled together |
| **Large Static Assets** | Unoptimized images, missing `next/image` or equivalent, large SVGs inline |

#### Rendering
| Issue | What to look for |
|-------|-----------------|
| **Unnecessary Re-renders** | Missing `React.memo`, `useMemo`, `useCallback` on expensive computations/components. Objects/arrays created inline in JSX props |
| **Context Overuse** | Large context providers that cause widespread re-renders on any state change |
| **Layout Thrashing** | Reading layout properties (offsetHeight, getBoundingClientRect) followed by writes in loops |
| **Missing Virtualization** | Long lists rendered entirely without windowing (react-window, react-virtuoso, etc.) |

#### Data & State
| Issue | What to look for |
|-------|-----------------|
| **Overfetching** | API calls fetching more data than displayed, missing field selection |
| **Missing Request Deduplication** | Same API called multiple times on mount, missing SWR/React Query caching |
| **Client-side Computation** | Heavy data transformations that should happen server-side |
| **Uncontrolled State Growth** | State stores that grow without cleanup, cached data without eviction |

**Stack-specific checks:**
- **Next.js**: SSR vs CSR decisions, missing `use server`/`use client` boundaries, streaming SSR opportunities, Image optimization, font loading
- **React**: Re-render analysis, hook dependency arrays, Suspense boundaries
- **Vue**: Reactive overhead, computed vs methods, v-if vs v-show
- **Any SPA**: Bundle analysis, tree-shaking effectiveness, dynamic imports

---

### 4. Consolidate findings

Each agent must produce findings in the following format:

```markdown
### [SEVERITY] <Title>
- **Category:** DB | ALGO | MEM | NET | BUNDLE | RENDER | ARCH
- **File:** <path>:<line>
- **Description:** <what the problem is>
- **Impact:** <estimated impact on performance>
- **Suggestion:** <specific fix with code example if helpful>
```

### Structured Findings Format

For each finding, also write a JSON block that maps to FindingSchema:

```json
{
  "severity": "critical|high|medium|low",
  "category": "DB|ALGO|MEM|NET|BUNDLE|RENDER|ARCH",
  "filePath": "src/path/to/file.ts",
  "line": 42,
  "title": "N+1 query in user listing",
  "description": "...",
  "suggestion": "..."
}
```

**Severity:**
- **critical**: Will cause visible performance degradation in production (e.g., N+1 on every request, full table scan on large table)
- **high**: Likely to cause issues under load (e.g., missing pagination on growing dataset)
- **medium**: Suboptimal but will not cause immediate issues (e.g., missing cache on moderately accessed data)
- **low**: Best practice not followed, marginal impact (e.g., synchronous logging in low-traffic endpoint)

### 5. Write report

Write the findings to the file `forja/changes/<feature>/perf-findings.md` (if pipeline mode) or directly in the Performance section of `report.md` (if standalone mode).

**Note:** In both Linear mode and Local mode, the findings file is written locally. In Linear mode this is a temporary file — the orchestrator handles posting it to Linear and cleaning up.

Format:

```markdown
# Performance Findings

## Summary
- Critical: X
- High: X
- Medium: X
- Low: X
- **Gate: PASS | WARN | FAIL**

## Findings

[findings here, ordered by severity]
```

**Gate rules:**
- Any `critical` or `high` → **FAIL**
- Any `medium` → **WARN**
- Only `low` or none → **PASS**

---

## Rules

- **Analyze ONLY the diff**: do not audit the entire codebase, only the new/modified code. For project-wide analysis, run `/forja:audit:backend` or `/forja:audit:frontend`.
- **No false positives**: only report if there is concrete evidence in the code. "There might be a problem" is not a finding.
- **Consider the context**: an admin endpoint with 10 req/day has a different threshold than a public endpoint with 1000 req/s
- **Stack-specific**: adapt the analysis based on the stack from config.md. Do not recommend React patterns for a Vue project.
- **Suggestions with code**: when possible, show what the corrected code would look like
- **ALWAYS adapt to the project type**: monorepo launches agents per workspace, backend focuses on DB/algo, frontend focuses on bundle/render
- **Language**: All findings and reports follow `Conventions → artifact_language` from `forja/config.md`.
- **Linear mode**: read design context from Linear document instead of local file; findings are still written to a local temporary file
- **Local mode**: read design context from local `design.md`; findings are written to local file
