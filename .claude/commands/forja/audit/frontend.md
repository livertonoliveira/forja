---
description: "Forja Audit: project-wide frontend performance audit. Auto-routes to Next.js methodology (5 layers) or generic methodology (11 categories) based on forja/config.md."
argument-hint: ""
---

# Forja Audit — Frontend Performance

You are the Forja frontend audit agent. Your mission is to conduct a comprehensive, project-wide performance audit of the entire frontend codebase — not just a diff. Read `forja/config.md` to determine the frontend framework and route to the correct methodology.

---

## Determine storage mode

Read `forja/config.md` and check the `Linear Integration` section:
- If `Configured: yes` → **Linear mode**
- If `Configured: no` → **Local mode**

---

## Process

### 1. Load context

Read `forja/config.md` and extract:
- **Frontend** field (Next.js, React, Vue, Angular, Nuxt, Svelte, Astro, etc.)
- **Project Type** (frontend | fullstack | monorepo)
- **Runtime** and **Framework** (for fullstack/monorepo, identify the frontend workspaces)

### 2. Route to methodology

- If `Frontend` = `Next.js` → use the **Next.js path** (5-layer analysis, 3 agents)
- Otherwise → use the **Generic path** (11-category analysis, 3 agents)

### 3. Launch 3 agents in parallel

Use the **Agent** tool to launch **3 agents in parallel in a SINGLE call**.

---

## Next.js Path (when Frontend = Next.js)

### Agent A — Rendering Strategy + Client/Server Boundary + Streaming

#### Rendering Strategy
| Issue | What to look for |
|---|---|
| **SSR where SSG/ISR would suffice** | Pages using `dynamic = 'force-dynamic'` or no cache config for content that rarely changes |
| **ISR revalidate too low** | `revalidate` set so low it effectively becomes SSR; assess the actual change frequency |
| **Missing PPR** | Routes with mixed static/dynamic content where Partial Prerendering could help (Next.js 14+) |
| **SSG on user-specific content** | Static generation for pages that contain authenticated or per-user data |
| **Edge runtime misuse** | Using Node.js-specific APIs on Edge runtime routes |

#### Client/Server Boundary
| Issue | What to look for |
|---|---|
| **"use client" on layouts or pages** | Pulls the entire component tree to the client unnecessarily |
| **"use client" on parent when only leaves need interactivity** | Violates the "push `use client` to the leaves" principle |
| **Heavy libraries in Client Components** | Importing large libs that are only used for server-side operations |
| **Server Actions underutilized** | Form submissions or mutations done via API routes when Server Actions would eliminate round-trips |
| **Unnecessary API routes** | Route Handlers created for operations that Server Actions or Server Components could handle directly |

#### Streaming
| Issue | What to look for |
|---|---|
| **Missing Suspense boundaries** | Slow data fetches blocking the entire page render |
| **Missing `loading.tsx`** | Route segments without loading UI for streaming |
| **Entire page awaited** | `await` on slow operations in the root layout or page that could be deferred with Suspense |

---

### Agent B — Data Fetching + Cache Hierarchy

#### Data Fetching
| Issue | What to look for |
|---|---|
| **Sequential fetches that could be parallel** | Multiple `await fetch()` calls in sequence that are independent; should use `Promise.all` |
| **fetch without cache config** | `fetch()` calls without explicit `cache` or `revalidate` on data that could be cached |
| **`cache: 'no-store'` on static data** | Disabling cache on data that doesn't change per request |
| **Missing `unstable_cache`** | DB queries or external API calls not wrapped in `unstable_cache` when they could be |
| **Waterfall of dependent fetches** | Data fetches where A must complete before B starts, without lazy loading or Suspense splitting |
| **Client-side fetch for server-renderable data** | Data fetched in `useEffect` or client hooks that could be fetched in Server Components |

#### Cache Hierarchy (App Router)
```
Request Memoization → Data Cache → Full Route Cache → Router Cache
(per request)        (persistent)  (HTML/RSC payload)  (client-side)
```
| Issue | What to look for |
|---|---|
| **Full Route Cache busted** | Opting all routes into `dynamic = 'force-dynamic'` globally |
| **Aggressive revalidation** | `revalidatePath('/')` called on every mutation, busting all cached routes |
| **Missing Request Memoization** | Same `fetch` URL called multiple times in the same request tree without deduplication |
| **Router Cache not leveraged** | Navigation patterns that bypass client-side cache (missing `<Link>` prefetching) |

---

### Agent C — Bundle/JS + Assets + Middleware + Build/Cold Start

#### Bundle / JavaScript
| Issue | What to look for |
|---|---|
| **Large First Load JS** | Routes with First Load JS > 200KB (from `next build` output) |
| **Barrel file imports** | `index.ts` barrel files preventing tree shaking in client bundles |
| **Full library imports** | `import _ from 'lodash'` vs `import debounce from 'lodash/debounce'` |
| **`dynamic()` misuse** | `dynamic(..., { ssr: false })` on components that could be server-rendered |
| **Missing code splitting** | Large feature sections loaded eagerly when rarely visited |

#### Images + Fonts
| Issue | What to look for |
|---|---|
| **`<img>` instead of `next/image`** | Raw HTML img tags without optimization |
| **Missing `priority` on LCP image** | Hero images or above-the-fold images without `priority` prop |
| **Wrong `sizes` attribute** | `next/image` without `sizes` causing full-resolution download on mobile |
| **Legacy image formats** | Serving JPEG/PNG where WebP/AVIF could be used |
| **External fonts instead of `next/font`** | Google Fonts loaded via `<link>` instead of `next/font/google` |
| **Missing font-display** | Fonts causing FOUT/FOIT without `font-display: swap` |

#### Middleware
| Issue | What to look for |
|---|---|
| **Overly broad matcher** | Middleware matching all routes (`matcher: '/'`) when only auth routes need it |
| **DB/API calls in middleware** | Expensive operations (DB queries, external API calls) running on every request in middleware |
| **Edge incompatibilities** | Node.js APIs used in middleware that is on Edge runtime |

#### Build + Cold Start
| Issue | What to look for |
|---|---|
| **Large serverless bundle** | Bundle size inflating cold start time in serverless deployments |
| **Turbopack not used in dev** | Slow development rebuilds when Turbopack could be enabled |
| **Unnecessary build-time computation** | Heavy static generation that could be ISR or on-demand |

---

## Generic Frontend Path (all other frameworks)

### Agent A — NET + BUNDLE + LOAD

#### Network / Assets
| Issue | What to look for |
|---|---|
| **No CDN** | Static assets served from origin server |
| **Assets without cache headers** | JS/CSS/images without long-lived cache-control |
| **No compression** | Responses without gzip/brotli encoding |
| **TTFB high** | SSR responses waiting on slow DB or API calls before streaming |

#### Bundle
| Issue | What to look for |
|---|---|
| **Heavy imports** | Importing entire libraries when only a function is needed |
| **No code splitting** | Large application bundled as a single chunk |
| **Tree shaking failures** | Barrel files (`index.ts`) preventing tree shaking |
| **Duplicate dependencies** | Multiple versions of the same library in the bundle |
| **Dev-only code in production** | Debug tools, devtools, or test utilities bundled in production |

#### Loading Strategy
| Issue | What to look for |
|---|---|
| **Render-blocking CSS/JS** | `<link rel="stylesheet">` or `<script>` in `<head>` without `async`/`defer` |
| **Missing lazy loading** | Large components/routes loaded eagerly when only needed later |
| **Preload misuse** | Over-preloading resources that compete for bandwidth, worsening LCP |
| **Missing resource hints** | Critical resources not hinted with `preconnect`, `dns-prefetch`, or `preload` |

---

### Agent B — RENDER + JS + HYDRAT

#### Rendering / Paint
| Issue | What to look for |
|---|---|
| **Layout thrashing** | Reading layout properties (`offsetHeight`, `getBoundingClientRect`) followed by writes in a loop |
| **Expensive CSS selectors** | Complex CSS selectors causing slow style recalculation |
| **Missing GPU compositing** | Animations using properties that trigger layout/paint instead of `transform`/`opacity` |
| **Missing virtualization** | Long lists rendered entirely without windowing (react-window, virtual scroll, etc.) |

#### JavaScript Execution
| Issue | What to look for |
|---|---|
| **Long tasks (> 50ms)** | Synchronous operations blocking the main thread during interaction |
| **Missing `useMemo` / `useCallback`** | Expensive computations or callbacks recreated on every render without memoization |
| **Unnecessary re-renders** | `React.memo` missing on expensive components; inline objects/arrays in JSX props |
| **Context overuse** | Large context providers causing widespread re-renders on any state change |
| **Event listeners not cleaned up** | `addEventListener` in `useEffect` without cleanup causing memory leaks |

#### Hydration
| Issue | What to look for |
|---|---|
| **Hydration mismatches** | SSR-rendered HTML differing from client render (dates, Math.random, browser-only APIs) |
| **Over-hydration** | Client-side hydrating components that have no interactivity (pure display components) |
| **Hydration waterfall** | Nested components each waiting on data before hydrating |

---

### Agent C — IMG + FONT + MEM + 3P + ARCH

#### Images / Media
| Issue | What to look for |
|---|---|
| **Unoptimized images** | Images not in WebP/AVIF format; images without `width`/`height` causing CLS |
| **Missing lazy loading** | Below-the-fold images without `loading="lazy"` |
| **Missing srcset** | Images without responsive sizes causing oversized downloads on mobile |
| **Large SVGs inlined** | Complex SVG markup inline in HTML/JSX inflating HTML size |
| **Autoplay video** | Videos with autoplay blocking page load |

#### Fonts
| Issue | What to look for |
|---|---|
| **FOUT / FOIT** | Web fonts loading without `font-display: swap` or `optional` |
| **Fonts not preloaded** | Critical above-the-fold fonts not hinted with `<link rel="preload">` |
| **Too many font variants** | Loading many weight/style variants when only a few are used |

#### Memory
| Issue | What to look for |
|---|---|
| **Memory leaks in SPA** | Event listeners not removed on unmount, timers not cleared, subscriptions leaked |
| **Unbounded state growth** | State stores / caches that grow on every navigation without cleanup |
| **Closures accumulating** | Large objects captured in closures that prevent garbage collection |

#### Third-party Scripts
| Issue | What to look for |
|---|---|
| **Render-blocking third parties** | Analytics, chat widgets, ads loaded synchronously in `<head>` |
| **Undeferred scripts** | Third-party scripts without `async` or `defer` |
| **Missing facades** | Embedding iframes or scripts eagerly (YouTube, Intercom) without a click-to-load facade |

#### Architecture
| Issue | What to look for |
|---|---|
| **Request waterfalls** | Component A fetches, renders, then component B fetches — could be parallel |
| **Over-fetching** | API calls returning more data than displayed; no field selection |
| **Missing SWR / React Query** | `useEffect` + `useState` for data fetching without deduplication, caching, or stale-while-revalidate |
| **Client-side computation** | Heavy data transformations that should happen server-side |

---

### 4. Consolidate findings

Each agent must produce findings in the following format:

```markdown
### [SEVERITY] <Descriptive Title>
- **Category:** NET | BUNDLE | LOAD | RENDER | JS | HYDRAT | IMG | FONT | MEM | 3P | ARCH
  (or for Next.js: STRATEGY | BOUNDARY | CACHE | BUNDLE | STREAMING | IMG | FONT | MIDDLEWARE | BUILD | COLD | ARCH)
- **Metric affected:** LCP | INP | CLS | FCP | TTFB | TBT | First Load JS | Bundle size
- **File:** <path>:<line>
- **Description:** <what the problem is, with concrete evidence>
- **Impact:** <estimated improvement — e.g., "LCP 4.2s → ~2.1s estimated">
- **Suggestion:** <specific fix with code example using the project's framework>
- **Effort:** <Hours | Days | Weeks>
```

**Severity:**
- **critical**: Core Web Vital in "Poor" range; severely impacting UX or conversion
- **high**: Core Web Vital in "Needs Improvement"; measurable impact on bounce/conversion
- **medium**: Relevant technical inefficiency, no immediate critical impact
- **low**: Incremental optimization, good for backlog

**Core Web Vitals thresholds:**
| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | ≤ 2.5s | 2.5s – 4.0s | > 4.0s |
| INP | ≤ 200ms | 200ms – 500ms | > 500ms |
| CLS | ≤ 0.1 | 0.1 – 0.25 | > 0.25 |
| FCP | ≤ 1.8s | 1.8s – 3.0s | > 3.0s |
| TTFB | ≤ 800ms | 800ms – 1800ms | > 1800ms |

### 5. Write report

**Local mode:** Write to `forja/audits/frontend-<YYYY-MM-DD>.md`

**Linear mode:**
1. Create a **new** Linear project named "Frontend Performance Audit — <YYYY-MM-DD>" (use `save_project`) with a description that includes:
   - Project/app name (from `forja/config.md`)
   - Framework and methodology used (e.g., "Next.js App Router — 5-layer methodology")
   - Gate result (PASS / WARN / FAIL) and findings count (e.g., "0 critical, 2 high, 4 medium")
   - One-sentence summary of the most impactful performance issue found
   **Never search for or reuse an existing project** — not even one that looks related. Each audit run gets its own dedicated project.
2. Create a Linear Document in this new project titled "Frontend Performance Audit — <YYYY-MM-DD>" with the full report
3. Create milestones (use `save_milestone`) linked to this project — only create a milestone if there are findings at that severity:
   - **"Critical Fixes"** — if any `critical` findings exist
   - **"High Fixes"** — if any `high` findings exist
   - **"Medium Fixes"** — if any `medium` findings exist
4. For each `critical` or `high` finding, create a Linear issue linked to this new project with:
   - Title: "[PERF] <finding title>"
   - Description (rich, structured):
     ```markdown
     ## Problem
     <What the performance problem is, with concrete evidence from the code. Cite file and line.>

     ## Impact
     <Estimated impact on user-perceived performance — which Web Vital is affected, estimated degradation.>

     ## Evidence
     - **File:** <path>:<line>
     - **Code:** <relevant snippet showing the issue>

     ## Fix
     <Specific fix with a code example using the project's framework and patterns.>

     ## Acceptance Criteria
     - [ ] <Specific, verifiable criterion — e.g., "LCP under 2.5s measured via Lighthouse">
     - [ ] <Another verifiable criterion>
     - [ ] No regressions in related tests

     ## Notes
     - **Effort:** <Hours | Days | Weeks>
     - **Affected Web Vital:** <LCP | CLS | INP | TTFB | FCP | TBT>
     ```
   - Label: `performance` or closest available
   - Priority: Urgent (critical) / High (high)
   - Milestone: link to the corresponding severity milestone ("Critical Fixes" or "High Fixes")

**Report format:**

```markdown
# Frontend Performance Audit — <YYYY-MM-DD>
Framework: <Next.js | React | Vue | ...>
Methodology: <Next.js 5-layer | Generic 11-category>

## Summary
- Critical: X
- High: X
- Medium: X
- Low: X
- **Gate: PASS | WARN | FAIL**

## General Diagnosis

<Executive summary: which metric is most critical, where in the pipeline the problem is concentrated, probable root cause>

## Core Web Vitals Status

| Metric | Status | Note |
|--------|--------|------|
| LCP | Good / Needs Improvement / Poor | |
| INP | Good / Needs Improvement / Poor | |
| CLS | Good / Needs Improvement / Poor | |

## Findings

[findings ordered by severity]

## Prioritized Roadmap

| Priority | Finding | Category | Metric | Est. Impact | Effort | Quick win? |
|----------|---------|----------|--------|-------------|--------|------------|

## Validation Metrics

| Finding | Metric | Current | Target | How to measure |
|---------|--------|---------|--------|----------------|

## Blind Spots

| Hypothesis | Why unconfirmed | What to collect |
|------------|----------------|-----------------|
```

**Gate rules:**
- Any `critical` or `high` → **FAIL**
- Any `medium` → **WARN**
- Only `low` or none → **PASS**

---

## Rules

- **Entire codebase scope**: project-wide audit, not a diff. For diff-scoped analysis, use `/forja:perf`.
- **Auto-route by config**: always read `forja/config.md` before choosing methodology — never assume the framework.
- **No false positives**: only report with concrete evidence. Cite file and line.
- **Framework-specific fixes**: solutions must use the framework's actual APIs and patterns.
- **Distinguish lab vs field data**: if Lighthouse data is available, note it's lab (simulated); CrUX is field (real users).
- **Highlight quick wins**: flag findings fixable in ≤1 day.
- **ALWAYS launch 3 agents in parallel** — never sequentially.
