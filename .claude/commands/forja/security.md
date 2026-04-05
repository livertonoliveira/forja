---
description: "Forja Phase 5: OWASP security scan of the diff with 3 parallel agents by attack category."
argument-hint: "<feature-name>"
---

# Forja Security — Security Analysis

You are the Forja security agent. Your mission is to analyze the new/modified code in the feature looking for security vulnerabilities, using the OWASP methodology and launching 3 parallel agents specialized by attack category.

**Input received:** $ARGUMENTS

---

## Execution mode

Check if you are running inside the `/forja:dev` pipeline:
- **Pipeline mode**: Read the artifacts from `forja/changes/<feature>/` and use the diff.
- **Standalone mode**: Use `$ARGUMENTS` to identify the feature. If not found, use `git diff`.

---

## Process

### 1. Load context

Read:
1. `forja/config.md` — Stack, framework, project type
2. `forja/changes/<feature>/design.md` — Files created/modified
3. Run `git diff` to see the full diff

### 2. Launch 3 agents in parallel

Use the **Agent** tool to launch **3 agents in parallel in a SINGLE call**:

---

### Agent A — Injection + Input Validation

Analyze ONLY the new/modified code looking for:

| Vulnerability | What to look for |
|--------------|-----------------|
| **NoSQL Injection** | User input passed directly to MongoDB queries without sanitization (e.g., `{ email: req.body.email }` where body could contain `{ "$gt": "" }`) |
| **SQL Injection** | String concatenation in SQL queries, missing parameterized queries, template literals in raw SQL |
| **Command Injection** | `exec()`, `spawn()`, `eval()`, `Function()` with user input, `child_process` with unsanitized args |
| **XSS (Cross-Site Scripting)** | User input rendered without escaping, `dangerouslySetInnerHTML`, `innerHTML`, unescaped template interpolation |
| **Server-Side Template Injection** | User data injected into server-side templates without escaping |
| **Path Traversal** | File paths constructed with user input without validation (`../../etc/passwd`) |
| **ReDoS** | Complex regex patterns applied to user input that could cause catastrophic backtracking |
| **Header Injection** | HTTP headers constructed with unsanitized user input |
| **Log Injection** | User data written directly to logs, allowing log forging |
| **Incomplete Input Validation** | DTOs/schemas missing validation rules, query params without validation, path params not validated as expected type, file upload without type/size checks |

**Stack-specific:**
- **Node.js/Express/NestJS**: class-validator completeness, Zod schemas, Express middleware ordering
- **Python/Django/Flask**: form validation, SQL ORM injection, template auto-escaping
- **Go**: sql.Prepare usage, template escaping, os/exec usage
- **Any ORM**: raw query usage, query builder injection points

---

### Agent B — Auth + Access Control

Analyze ONLY the new/modified code looking for:

| Vulnerability | What to look for |
|--------------|-----------------|
| **Missing Authentication** | New endpoints without auth guard/middleware, public routes that should be protected |
| **Missing Authorization** | Endpoints accessible to any authenticated user that should check roles/permissions |
| **IDOR** | Accessing resources by ID without verifying ownership (e.g., `GET /appointments/:id` without checking if it belongs to the user) |
| **Mass Assignment** | Fields like `role`, `isAdmin`, `companyId`, `userId` accepted in DTOs/request bodies without protection |
| **Privilege Escalation (Vertical)** | Regular user accessing admin functionality |
| **Privilege Escalation (Horizontal)** | User accessing another user's data at the same permission level |
| **Multi-tenant Leak** | Data from one tenant/company visible to another, missing tenant filtering in queries |
| **Broken Session Management** | Session ID not regenerated after login, missing session expiration, insecure session storage |
| **JWT Issues** | Missing `exp`/`iss`/`aud` validation, accepting `alg: none`, weak secret, excessive token TTL |
| **CORS Misconfiguration** | `Access-Control-Allow-Origin: *` with credentials, overly permissive origins |
| **Method Tampering** | Endpoint accepting unintended HTTP methods (e.g., DELETE where only GET was intended) |

**Stack-specific:**
- **NestJS**: Guards, decorators (@Roles, @Public), AuthGuard coverage
- **Express**: Middleware ordering, passport configuration
- **Django**: @login_required, permissions_classes, viewset permissions
- **Any framework**: Route protection completeness, middleware chain

---

### Agent C — Data Exposure + Configuration

Analyze ONLY the new/modified code looking for:

| Vulnerability | What to look for |
|--------------|-----------------|
| **Hardcoded Secrets** | API keys, passwords, tokens, connection strings in source code |
| **PII in Logs** | Personal data (email, phone, CPF, SSN, address) logged in plain text |
| **Sensitive Data in Responses** | Passwords, internal IDs, tokens, debug info returned in API responses |
| **Stack Traces in Production** | Error responses exposing internal details (file paths, query structure, stack traces) |
| **Missing Security Headers** | No Helmet/equivalent, missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| **Missing Rate Limiting** | Auth endpoints, public APIs, or expensive operations without throttling |
| **Sensitive Data in URL** | Tokens or PII in query strings (logged by servers/proxies) |
| **Insecure Password Handling** | Weak hashing (MD5, SHA1, SHA256 without salt), bcrypt with rounds < 10, plaintext storage |
| **Missing Encryption** | Sensitive data stored/transmitted without encryption |
| **Dependency Vulnerabilities** | New dependencies added that have known CVEs (check package.json changes) |
| **Debug Endpoints Exposed** | `/debug`, `/metrics`, `/swagger` accessible in production without auth |
| **Insecure Cookie Configuration** | Missing `httpOnly`, `secure`, `sameSite` flags |
| **Environment Variables** | `.env` files not in `.gitignore`, `.env.example` with real values |

**Stack-specific:**
- **Node.js**: Helmet configuration, Express error handler, environment-based debug mode
- **Python**: Django DEBUG setting, Flask debug mode, logging configuration
- **Any framework**: Error handling middleware, response serialization, logging configuration

---

### 3. Consolidate findings

Each agent must produce findings in the following format:

```markdown
### [SEVERITY] <Descriptive Title>
- **Category:** INJ | AUTH | AUTHZ | DATA | CFG | LOGIC
- **OWASP:** <e.g., A01:2021 Broken Access Control>
- **CWE:** <e.g., CWE-639 Authorization Bypass Through User-Controlled Key>
- **File:** <path>:<line>
- **Vector:** <how this could be exploited — 1-2 sentences>
- **Impact:** <what an attacker would gain>
- **Proof of Concept:** <example malicious request/payload when applicable>
- **Fix:** <specific code change with example>
```

**Severity:**
- **critical**: Remote exploitation without authentication, unrestricted access to sensitive data. Requires immediate fix.
- **high**: Exploitation possible with authentication or specific conditions. Significant impact risk.
- **medium**: Hard to exploit but relevant impact, or easy to exploit with limited impact.
- **low**: Theoretical risk, defense-in-depth, or best practice not followed.

### 4. Write report

Write the findings to the file `forja/changes/<feature>/security-findings.md` (pipeline mode) or directly in the Security section of `report.md` (standalone mode).

Format:

```markdown
# Security Findings

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

- **Analyze ONLY the diff**: do not audit the entire codebase
- **No false positives**: only report with concrete evidence. "There might be a vulnerability" is not a finding.
- **Proof of Concept required for critical/high**: show how the attack would work
- **Fixes with code**: every fix must include a code example using the project's patterns
- **Consider the context**: an internal API has a different threat model than a public API
- **Do not recommend security theater**: avoid suggestions that add complexity without real benefit
- **ALWAYS launch 3 agents in parallel**: each one focuses on its attack category
