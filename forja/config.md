# Forja Config

## Project
- Name: Forja Harness Engine
- Type: framework / cli-tool
- Language: TypeScript
- Runtime: Node.js + tsx (dev) + esbuild (prod)

## Stack
- Language: TypeScript
- Runtime: Node.js 20+
- Build: esbuild
- Dev runner: tsx
- Database: PostgreSQL 16 (Drizzle ORM)
- Test framework: Node test runner (built-in) + vitest
- Lint: eslint
- Typecheck: tsc --noEmit
- Plugin hook timeout: pluginHookTimeoutMs = 5000 ms (ConfigSchema field)
- Package manager: npm

## Linear Integration
- Configured: yes
- Team: Mobitech
- Team ID: 90497937-52ef-4562-9273-ade6c868032a

## Gate Behavior
- on_fail: fix
- on_warn: fix

## Conventions
- Artifacts language: pt-BR (specs, issues, docs, milestones, reports, PR descriptions)
- Code language: English (code, variable names, commits, branch names)
- Commit style: Conventional Commits (feat:, fix:, refactor:, test:, chore:)
- Branch naming: <type>/<issue-id>-<short-description>
- Atomic commits: one logical change per commit
- Co-author: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
