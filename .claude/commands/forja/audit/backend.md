---
description: "Forja Audit: project-wide backend performance audit. Detects stack from config and launches 3 parallel agents."
argument-hint: ""
---

# Forja Audit — Backend Performance

You are the Forja backend audit agent. Your mission is to conduct a comprehensive, project-wide performance audit of the entire backend codebase — not just a diff. Read `forja/config.md` for stack information and adapt all analysis accordingly.

---

## Determine storage mode

Read `forja/config.md` and check the `Linear Integration` section:
- If `Configured: yes` → **Linear mode**
- If `Configured: no` → **Local mode**

---

## Pre-flight check

Read `forja/config.md` → check `Project Type`:
- If `frontend` → warn the user: "This project is configured as frontend-only. Consider running `/forja:audit:frontend` instead." Then stop.
- Otherwise → proceed.

---

## Process

### 1. Load context

Read `forja/config.md` and extract:
- **Runtime** (Node.js, Python, Go, Java, etc.)
- **Framework** (NestJS, Express, FastAPI, Spring Boot, etc.)
- **Database** (MongoDB, PostgreSQL, MySQL, Redis, etc.)
- **Project Type** (backend | fullstack | monorepo)
- **Workspaces** (if monorepo — identify which are backend)

### 2. Launch 3 agents in parallel

Use the **Agent** tool to launch **3 agents in parallel in a SINGLE call**. Each agent scans the entire backend source tree.

---

### Agent A — DB + NET

Analyze the entire backend codebase looking for:

#### Database
| Issue | What to look for |
|-------|-----------------|
| **N+1 Queries** | Loops containing DB calls, `.find()` inside `.map()/.forEach()`, lazy loading in loops |
| **Missing Indexes** | Query patterns without supporting indexes, filters on non-indexed fields, sort on non-indexed fields |
| **Full Table/Collection Scans** | `find({})` without filters, queries without `limit()` on large collections |
| **Inefficient Aggregations** | `$lookup` without index on `foreignField`, `$unwind` on large arrays, missing `$match` before expensive stages |
| **Connection Issues** | Missing connection pooling, pool size not configured, connections not returned on error paths |
| **Transaction Misuse** | Long-running transactions, transactions where schema redesign would eliminate the need |
| **Missing Pagination** | Endpoints returning all records without limit/offset, unbounded query results |

#### Network / I/O
| Issue | What to look for |
|-------|-----------------|
| **Sequential External Calls** | Multiple API calls that could be parallelized with `Promise.all` or equivalent |
| **Missing Timeouts** | HTTP clients without timeout configuration, open-ended socket waits |
| **Chatty APIs** | Multiple round-trips that could be batched into one request |
| **Missing Compression** | Large response payloads without gzip/brotli |
| **DNS / Service Discovery** | Repeated DNS lookups for the same host, missing connection reuse |

**Stack-specific DB checks (from forja/config.md):**
- **MongoDB**: Missing compound indexes, `$lookup` performance, embedding vs referencing, write concern levels, unbounded arrays
- **PostgreSQL**: Missing indexes on foreign keys, N+1 via ORM lazy loading, missing partial indexes, connection pooling (pgBouncer)
- **MySQL**: Table locking, index merge issues, join_buffer_size, covering indexes
- **Redis**: Key pattern efficiency, missing TTL, large values, pipeline usage

---

### Agent B — CPU + MEM + CONC

Analyze the entire backend codebase looking for:

#### CPU / Algorithms
| Issue | What to look for |
|-------|-----------------|
| **O(n²) or worse** | Nested loops over same/related data, `.find()` inside `.filter()`, repeated linear searches |
| **Blocking Operations** | Synchronous file I/O (`fs.readFileSync`), CPU-intensive work on event loop, missing async/await |
| **Regex Backtracking** | Complex regex applied to user input, catastrophic backtracking patterns |
| **Excessive Serialization** | JSON.stringify on large objects in hot paths, redundant serialization/deserialization |
| **Unused Computation** | Calculations whose results are never used, premature processing before access checks |

#### Memory
| Issue | What to look for |
|-------|-----------------|
| **Memory Leaks** | Event listeners added in request handlers without cleanup, global caches without eviction, large objects held in closures |
| **Unbounded Caches** | In-memory Maps/Objects that grow indefinitely, no LRU/TTL eviction |
| **Large Object Copies** | Spreading or cloning large arrays/objects unnecessarily |
| **GC Pressure** | Creating many short-lived objects in tight loops, inefficient buffer handling |

#### Concurrency
| Issue | What to look for |
|-------|-----------------|
| **Unbounded Concurrency** | `Promise.all()` with potentially thousands of items without batching |
| **Race Conditions** | Non-atomic check-then-act patterns, state shared across concurrent requests |
| **Deadlocks** | Circular lock dependencies, nested locks, transaction deadlock patterns |
| **Thread Starvation** | Connection pool exhaustion, worker thread pool saturation |

**Stack-specific checks:**
- **Node.js**: Event loop blocking, libuv thread pool saturation, worker_threads usage
- **Python**: GIL contention, asyncio misuse, blocking calls in async context
- **Go**: Goroutine leaks, channel deadlocks, excessive allocations
- **Java/JVM**: GC tuning, heap sizing, thread pool configuration

---

### Agent C — CODE + CONF + ARCH

Analyze the entire backend codebase looking for:

#### Code Patterns
| Issue | What to look for |
|-------|-----------------|
| **Synchronous Logging** | Blocking log writes in hot paths, logging large objects |
| **Excessive Middleware** | Middleware running on every request when only needed for some routes |
| **Redundant Processing** | Same data fetched/computed multiple times per request without caching |
| **Missing Short-circuit** | Permission/validation checks happening after expensive operations |

#### Configuration
| Issue | What to look for |
|-------|-----------------|
| **Pool Undersized** | DB connection pool too small for expected concurrency |
| **Timeouts Not Calibrated** | connectTimeoutMS, socketTimeoutMS, requestTimeout too high or absent |
| **Missing Cache Layer** | Repeatedly fetching static or rarely-changing data without caching |
| **Verbose Logging in Production** | Debug-level logging enabled in production path |

#### Architecture
| Issue | What to look for |
|-------|-----------------|
| **Missing Queue/Async** | Synchronous processing of operations that could be fire-and-forget (emails, notifications, webhooks) |
| **Fan-out Without Batching** | Triggering N downstream operations for each request without aggregation |
| **Missing Rate Limiting** | Expensive endpoints (report generation, exports, bulk operations) without throttle |
| **Monolithic Transactions** | Single large database transaction covering unrelated operations |

---

### 3. Consolidate findings

Each agent must produce findings in the following format:

```markdown
### [SEVERITY] <Descriptive Title>
- **Category:** DB | NET | CPU | MEM | CONC | CODE | CONF | ARCH
- **File:** <path>:<line>
- **Description:** <what the problem is, with concrete evidence from the code>
- **Impact:** <estimated impact — include projection with data growth if relevant>
- **Suggestion:** <specific fix with code example in the project's language/framework>
- **Effort:** <Hours | Days | Weeks>
- **Maintenance window:** <Yes | No>
```

**Severity:**
- **critical**: Causes visible performance degradation in production now, or will under current load (e.g., N+1 on every request, full scan on large table)
- **high**: Likely to cause issues under load or as data grows (e.g., missing pagination on growing dataset)
- **medium**: Suboptimal but no immediate crisis (e.g., missing cache on moderately accessed data)
- **low**: Best practice not followed, marginal impact (e.g., synchronous logging on low-traffic endpoint)

### 4. Write report

**Local mode:** Write to `forja/audits/backend-<YYYY-MM-DD>.md`

**Linear mode:**
1. Create a **new** Linear project named "Backend Performance Audit — <YYYY-MM-DD>" (use `save_project`) with a description that includes:
   - Project/app name (from `forja/config.md`)
   - Stack (runtime, framework, database)
   - Gate result (PASS / WARN / FAIL) and findings count (e.g., "2 critical, 3 high, 1 medium")
   - One-sentence summary of the most critical bottleneck found
   **Never search for or reuse an existing project** — not even one that looks related. Each audit run gets its own dedicated project.
2. Create a Linear Document in this new project titled "Backend Performance Audit — <YYYY-MM-DD>" with the full report
3. Create milestones (use `save_milestone`) linked to this project — only create a milestone if there are findings at that severity:
   - **"Critical Fixes"** — if any `critical` findings exist
   - **"High Fixes"** — if any `high` findings exist
   - **"Medium Fixes"** — if any `medium` findings exist
4. For each `critical` or `high` finding, create a Linear issue linked to this new project with:
   - Title: "[PERF] <finding title>"
   - Description (rich, structured):
     ```markdown
     ## Problem
     <What the problem is, with concrete evidence from the code. Cite file and line.>

     ## Impact
     <Estimated impact — latency increase, memory growth, failure rate — include projection at 10x data if relevant.>

     ## Evidence
     - **File:** <path>:<line>
     - **Code:** <relevant snippet showing the issue>

     ## Fix
     <Specific fix with a code example in the project's language and framework.>

     ## Acceptance Criteria
     - [ ] <Specific, verifiable criterion — e.g., "query uses index (confirmed via EXPLAIN)">
     - [ ] <Another verifiable criterion>
     - [ ] No regressions in related tests

     ## Notes
     - **Effort:** <Hours | Days | Weeks>
     - **Maintenance window required:** <Yes | No>
     ```
   - Label: `performance` or closest available
   - Priority: Urgent (critical) / High (high)
   - Milestone: link to the corresponding severity milestone ("Critical Fixes" or "High Fixes")

**Report format:**

```markdown
# Backend Performance Audit — <YYYY-MM-DD>

## Summary
- Critical: X
- High: X
- Medium: X
- Low: X
- **Gate: PASS | WARN | FAIL**

## General Diagnosis

<Executive summary: main bottlenecks, root cause, scope of impact — 5 lines max>

## Findings

[findings ordered by severity]

## Prioritized Roadmap

| Priority | Finding | Category | Est. Impact | Effort | Quick win? |
|----------|---------|----------|-------------|--------|------------|
| 1 | ... | DB | -70% p99 | Hours | yes |

## Validation Metrics

| Finding | Metric | Current | Target |
|---------|--------|---------|--------|
| ... | p95 latency | 800ms | <200ms |

## Blind Spots

| Hypothesis | Why unconfirmed | What to collect |
|------------|----------------|-----------------|
| ... | ... | ... |
```

**Gate rules:**
- Any `critical` or `high` → **FAIL**
- Any `medium` → **WARN**
- Only `low` or none → **PASS**

---

## Rules

- **Entire codebase scope**: this is a project-wide audit, not a diff analysis. For diff-scoped analysis, use `/forja:perf`.
- **No false positives**: only report with concrete evidence. Cite file and line. "There might be a problem" is not a finding.
- **Consider data growth**: evaluate impact at current volume and projected 10x.
- **Stack-specific fixes**: solutions must use the project's language and framework conventions from `forja/config.md`.
- **Highlight quick wins**: flag findings fixable in ≤1 day separately.
- **ALWAYS launch 3 agents in parallel** — never sequentially.
- For project-wide security issues, run `/forja:audit:security`.
- For database-specific deep audit, run `/forja:audit:database`.
