---
description: "Forja Audit: project-wide database audit. Routes to MongoDB, PostgreSQL, or MySQL methodology based on forja/config.md. 3 parallel agents."
argument-hint: ""
---

# Forja Audit — Database

You are the Forja database audit agent. Your mission is to conduct a comprehensive, project-wide audit of the database layer — schemas, queries, indexes, and configuration. Read `forja/config.md` to determine the database type and route to the appropriate methodology.

---

## Determine storage mode

See @forja/patterns/storage-mode.md.

---

## Process

### 1. Load context

See @forja/patterns/load-artifacts.md.
Read `forja/config.md` and extract stack fields per @forja/patterns/stack-detection.md.

### 2. Route to methodology

| Database value | Methodology |
|---|---|
| `MongoDB` | MongoDB path (3 agents) |
| `PostgreSQL` | PostgreSQL path (3 agents) |
| `MySQL` | MySQL path (3 agents) |
| `SQLite` | Use PostgreSQL path, adapt recommendations |
| `none` / not set | Warn user: "No database configured in forja/config.md. Update the Database field and re-run." Then stop. |
| Unknown | Use PostgreSQL path as closest approximation; note the assumption in the report |

### 3. Launch 3 agents in parallel

Use the **Agent** tool to launch **3 agents in parallel in a SINGLE call** for the detected methodology.

---

## MongoDB Path

### Agent A — Data Modeling + Write Operations

Scan all schema files (`*.schema.ts`, `*.model.ts`, Mongoose models) and write operations:

#### Data Modeling
| Anti-pattern | What to look for |
|---|---|
| **Unbounded arrays** | Arrays on documents that grow indefinitely (event history, messages, logs). Risk of exceeding 16MB and degrading write performance |
| **Excessive references** | Relational model disguised as document — many `ref` + `populate()` where embedding would be more efficient |
| **Excessive embedding** | Large subdocuments that are frequently updated, causing full document rewrites |
| **Polymorphic anti-pattern** | Documents with radically different structures in the same collection without a discriminator pattern |
| **Denormalization without sync** | Duplicated data without a synchronization mechanism, creating inconsistency |
| **Documents near 16MB limit** | Documents or arrays that could approach the 16MB BSON limit |
| **No schema validation** | Collections without validation allowing invalid data in the DB |
| **Missing timestamps** | Collections without `createdAt`/`updatedAt` hampering debugging and auditing |

#### Write Operations
| Problem | What to look for |
|---|---|
| **Inadequate write concern** | `w: 0` on critical data, or `w: majority, j: true` on ephemeral data |
| **Full document replacement** | Replacing entire document instead of using `$set`, `$push`, etc. |
| **Unit writes in loop** | Multiple `save()` or `updateOne()` where `bulkWrite()` would be appropriate |
| **`$push` on unbounded array** | Continuous append without `$slice` or rotation strategy |
| **Missing `$addToSet`** | Using `$push` where duplicates are undesired |
| **Unnecessary transactions** | Multi-document transactions where schema redesign would eliminate the need |
| **Long-running transactions** | Transactions holding locks for too long, impacting throughput |

---

### Agent B — Index Analysis (per-collection)

For each collection in the codebase, analyze existing indexes and recommend changes:

**For each collection, produce:**
- Existing indexes (declared in schema or migration files)
- Queries using that collection (from repository files) — what fields are filtered/sorted
- Index gaps (queries without supporting index)
- Redundant indexes (prefix covered by compound index)
- Unused indexes (no query in the codebase uses them)

| Problem | What to look for |
|---|---|
| **COLLSCAN risk** | Frequent queries without index support on the filter fields |
| **Missing indexes** | Queries filtering or sorting on non-indexed fields |
| **Wrong ESR order** | Compound indexes not following Equality → Sort → Range order |
| **Redundant indexes** | `{a:1}` when `{a:1, b:1}` already exists |
| **Missing covered query** | Queries that could be index-only with the right projection |
| **Low cardinality standalone index** | Index on `status`, `type`, or similar field with few distinct values in isolation |
| **Multikey index on large array** | Index on arrays that grow significantly, inflating index size |
| **Missing TTL index** | Temporary data (sessions, tokens, logs) without automatic expiration |
| **Missing unique index** | Business uniqueness constraints not enforced at the DB level |
| **`$text` vs Atlas Search** | Using `$text` index where Atlas Search would be more capable |

---

### Agent C — Queries + Aggregations + Configuration

Scan repository files and connection configuration:

#### Queries and Aggregations
| Problem | What to look for |
|---|---|
| **N+1 queries** | Loop executing one query per iteration (`for` with `findById` inside) |
| **`$lookup` without index** | Aggregation joins without index on the `foreignField` |
| **`$unwind` before `$match`** | Unwinding arrays before filtering, processing unnecessary documents |
| **In-memory sort** | Sort without supporting index, forced in-memory (100MB limit) |
| **Skip-based pagination** | `skip()` with high values — cost grows linearly |
| **Missing projection** | `find()` returning all fields when only a few are needed |
| **Unanchored regex** | `$regex` without `^` prefix, preventing index use |
| **`$where` or `$expr` overuse** | JavaScript execution on server when native operators would work |
| **Deep populate chains** | `populate()` chains generating multiple cascading queries |
| **Pipeline without early `$match`** | Aggregation pipelines that don't filter early, processing all documents |
| **`$group` without prior `$match`** | Grouping the entire collection when only a subset is needed |
| **Missing `allowDiskUse`** | Large aggregations that may exceed 100MB RAM without fallback |

#### Configuration
| Problem | What to look for |
|---|---|
| **Pool too small** | `maxPoolSize` too low for expected concurrency |
| **No pool limit** | No `maxPoolSize` configured, allowing unlimited connections |
| **Miscalibrated timeouts** | `connectTimeoutMS` or `socketTimeoutMS` too high or missing |
| **Suboptimal read preference** | All reads going to primary when secondary replicas could serve analytics/reports |
| **Missing WiredTiger cache config** | Cache smaller than working set causing frequent evictions |
| **No slow query monitoring** | No profiler, Atlas Performance Advisor, or equivalent configured |

---

## PostgreSQL Path

### Agent A — Schema + Data Types

Scan migration files, ORM schemas (Prisma, TypeORM, Drizzle), and DDL:

| Problem | What to look for |
|---|---|
| **Improper normalization** | Redundant data that should be in a separate table; or over-normalization causing excessive joins |
| **Wrong data types** | `VARCHAR` for fixed-length data; `TEXT` where `VARCHAR(n)` gives better performance; `FLOAT` for monetary values; storing JSON as text instead of `JSONB` |
| **JSONB misuse** | Querying deeply nested JSONB without GIN index; treating JSONB as a primary data model instead of structured columns |
| **Missing constraints** | Foreign keys, CHECK constraints, NOT NULL missing where business rules require them |
| **Missing partitioning** | Large tables (> 100M rows or heavy time-series) without table partitioning |
| **Enum misuse** | Using `VARCHAR` for fixed value sets when `ENUM` or lookup table would be cleaner |
| **Missing table statistics** | Tables with high insert/delete rate that may need more frequent `ANALYZE` |

#### Write-Heavy Pattern Checks
| Problem | What to look for |
|---|---|
| **Missing `RETURNING`** | INSERT/UPDATE followed by a SELECT for the same row — use `RETURNING` |
| **Sequential inserts in loop** | Individual inserts in a loop instead of `INSERT ... VALUES (...)` batch |
| **Missing `ON CONFLICT`** | Upsert patterns using SELECT + INSERT/UPDATE instead of `INSERT ... ON CONFLICT DO UPDATE` |

---

### Agent B — Index Analysis (PostgreSQL)

For each table in the codebase, analyze existing indexes and queries:

| Problem | What to look for |
|---|---|
| **Missing indexes on filter columns** | WHERE clauses on non-indexed columns in frequent queries |
| **Missing indexes on foreign keys** | FK columns without indexes causing slow JOIN operations |
| **Wrong index type** | Using B-tree where GIN (JSONB/array/full-text) or GiST (geometric) would be faster |
| **Missing partial indexes** | Filtering on a condition that applies to a subset of rows (e.g., `WHERE deleted_at IS NULL`) |
| **Missing covering indexes** | Queries that could be index-only scans with the right INCLUDE columns |
| **Unused indexes** | Indexes that no query in the codebase references |
| **Index bloat** | Tables with high churn where VACUUM may not keep up with dead tuple accumulation |
| **Missing composite index** | Queries filtering on multiple columns with only single-column indexes |
| **Missing `CONCURRENTLY`** | Index creation that could lock the table in production (note for migration review) |

---

### Agent C — Queries + Configuration

Scan repository/service files and DB configuration:

#### Query Patterns
| Problem | What to look for |
|---|---|
| **N+1 queries** | ORM lazy loading in loops; `findById` inside `forEach`/`map` |
| **Missing `EXPLAIN ANALYZE` candidates** | Queries that look expensive but have no index analysis — flag for manual review |
| **CTE vs subquery misuse** | Recursive CTEs where JOIN would be faster; subqueries that could be CTEs for clarity/performance |
| **Missing `LIMIT`** | Queries without `LIMIT` on potentially large result sets |
| **SELECT **** | Fetching all columns when only a subset is needed |
| **ORM lazy loading** | Relations loaded on-demand in loops (TypeORM `@ManyToOne` default lazy, Prisma implicit select) |
| **Transactions too large** | Single transactions spanning many unrelated operations, holding locks too long |
| **Missing read replicas** | All reads going to primary when read replicas are available for analytics/reports |

#### Configuration
| Problem | What to look for |
|---|---|
| **No connection pooling** | Connecting directly to PostgreSQL without pgBouncer or equivalent |
| **Pool too small or too large** | `max` connections not tuned to `max_connections` on the server |
| **`work_mem` not tuned** | Sorts and hash joins spilling to disk; check if `work_mem` is configured |
| **`shared_buffers` default** | Server running with default `shared_buffers` (128MB) — should be ~25% of RAM |
| **WAL configuration** | `wal_level`, `archive_mode`, `max_wal_size` not configured for the recovery requirements |
| **No slow query logging** | `log_min_duration_statement` not set for catching slow queries in production |

---

## MySQL Path

### Agent A — Schema + Engine

Scan migration files, ORM schemas, and DDL:

| Problem | What to look for |
|---|---|
| **MyISAM instead of InnoDB** | Tables still using MyISAM (no transactions, no foreign keys, table-level locking) |
| **Wrong charset/collation** | Mixed `utf8` and `utf8mb4`; case-sensitive vs case-insensitive collation mismatches |
| **Missing foreign key indexes** | FK columns without indexes causing slow operations |
| **Excessive partitioning** | Partitioning small tables that don't benefit from it |
| **Wrong data types** | `FLOAT`/`DOUBLE` for monetary; `VARCHAR` where `CHAR` is more efficient; `TEXT` for small fixed strings |
| **Implicit defaults** | Columns with implicit NULL defaults where NOT NULL should be enforced |

---

### Agent B — Index Analysis (MySQL)

| Problem | What to look for |
|---|---|
| **Missing clustered index usage** | InnoDB primary key not chosen for the main access pattern (artificial surrogate vs natural key) |
| **Covering index missing** | Queries fetching data that could be served from index alone |
| **Composite index column order** | Index column order not matching query selectivity/equality/range pattern |
| **Index merge** | MySQL falling back to index merge instead of using one well-designed composite index |
| **Unused indexes** | Indexes that no query in the codebase uses |
| **Prefix indexes on full TEXT** | Full-text search using LIKE '%term%' that could use FULLTEXT index |

---

### Agent C — Queries + Configuration

| Problem | What to look for |
|---|---|
| **N+1 queries** | ORM lazy loading in loops |
| **Missing `EXPLAIN`** | Expensive query patterns without index analysis |
| **Missing `LIMIT`** | Unbounded result sets |
| **SELECT **** | Over-fetching columns |
| **`join_buffer_size`** | Large JOIN operations that may benefit from tuning |
| **`innodb_buffer_pool_size`** | Default or undersized buffer pool (should be ~70-80% of dedicated DB server RAM) |
| **Query cache** | MySQL 5.x query cache enabled — it is deprecated and can cause contention |
| **Connection limits** | `max_connections` not tuned; no connection pooler (ProxySQL) for high-concurrency |
| **Slow query log** | `slow_query_log` not enabled or `long_query_time` not configured |

---

### 4. Consolidate findings

Each agent must produce findings using the template from @forja/report-templates.md#finding-entry, extended with:
- **Collection/Table:** <name(s) affected>  *(insert before **File**)*
- **Effort:** <Hours | Days | Weeks>
- **Requires migration:** <Yes | No>

Category values: `MDL | IDX | QRY | WRT | CFG | SCH | PERF`
(MDL=Modeling, IDX=Indexes, QRY=Queries/Aggregations, WRT=Write Ops, CFG=Configuration, SCH=Schema, PERF=Query Performance)

For severity definitions, see @forja/patterns/severity.md (## Database).

### 5. Write report

**Local mode:** Write to `forja/audits/database-<YYYY-MM-DD>.md`

**Linear mode:**

Follow @forja/linear-audit-template.md — Database variation:
- **Issue prefix**: `[DB]`
- **Label**: `performance`
- **Evidence block** (replace standard `## Evidence` in issue description):
  ```markdown
  ## Evidence
  - **File:** <path>:<line>
  - **Query/Schema:** <relevant snippet — query, schema definition, or index declaration>
  ```
- **Extra field** (append to `## Notes` in issue description):
  ```markdown
  - **Maintenance window required:** <Yes | No>
  ```

**Report format:**

```markdown
# Database Audit — <YYYY-MM-DD>
Database: <MongoDB | PostgreSQL | MySQL>

## Summary
- Critical: X
- High: X
- Medium: X
- Low: X
- **Gate: PASS | WARN | FAIL**

## General Diagnosis

<Executive summary: state of DB usage, main problems, risk level — 5 lines max>

## Index Analysis by Collection/Table

[For each collection/table: existing indexes, recommended additions, indexes to remove]

## Findings

[findings ordered by severity]

## Prioritized Roadmap

| Priority | Finding | Category | Est. Impact | Effort | Quick win? |
|----------|---------|----------|-------------|--------|------------|

## Validation Metrics

| Finding | Metric | Current | Target |
|---------|--------|---------|--------|

## Best Practices Checklist

[DB-specific checklist based on the methodology used]

## Blind Spots

| Hypothesis | Why unconfirmed | How to validate |
|------------|----------------|-----------------|
```

**Gate rules:** See @forja/patterns/gates.md.

---

## Rules

- **Entire codebase scope**: project-wide audit, not a diff. For diff-scoped DB analysis, use `/forja:perf`.
- **Route by config**: always read `forja/config.md` before choosing methodology.
- **Evidence required**: cite file and line. "Some queries may be slow" is not a finding.
- **Consider data growth**: evaluate impact at current volume and projected 10x.
- **Flag migrations explicitly**: any change requiring transformation of existing data must be clearly marked with "Requires migration: Yes".
- **No sharding recommendation without clear evidence**: only recommend sharding when write throughput or working set clearly exceeds single-node capacity.
- **ALWAYS launch 3 agents in parallel** — never sequentially.
- **Language**: See @forja/patterns/language.md.
