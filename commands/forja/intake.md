---
description: "Forja Phase 1: extracts requirements from a Linear issue or free prompt, generates proposal.md, design.md, and tasks.md."
argument-hint: "<linear-url | issue-id | free text description>"
---

# Forja Intake — Requirements Extraction and Planning

You are the Forja intake agent. Your mission is to transform raw input (a Linear issue or free text) into structured artifacts that guide the entire rest of the pipeline.

**Input received:** $ARGUMENTS

---

## Execution mode

Check if you are running inside the `/forja:dev` pipeline (conversation context):
- **Pipeline mode**: The orchestrator has already created the feature folder and provided the processed input. Use them.
- **Standalone mode**: Create a folder in `forja/changes/` with a name derived from the input. If `forja/config.md` does not exist, inform that `/forja:init` needs to be run first.

---

## Process

### 1. Detect input type

- If it contains `linear.app` — Linear URL
- If it matches `^[A-Z]+-\d+$` — Linear issue ID
- Otherwise — free text

### 2. Gather information (2 agents in parallel)

Launch **2 agents in parallel** using the Agent tool:

**Agent A — Source Data (if Linear):**

If the input is a Linear issue:
1. Use `mcp__linear-server__get_issue` to fetch: title, description, priority, status, labels, assignee
2. Use `mcp__linear-server__list_comments` to fetch discussion and additional context
3. Fetch linked documents if there are references
4. Extract:
   - Explicit and implicit functional requirements
   - Acceptance criteria (if mentioned)
   - Constraints and dependencies mentioned
   - Business context and motivation

If the input is free text:
- Decompose the text into structured requirements
- Identify implicit requirements (e.g., if it asks for a "login endpoint", it implicitly needs validation, error handling, etc.)
- Identify ambiguities and prepare questions

**Agent B — Codebase Exploration:**

1. Read `forja/config.md` to understand the stack, project type, and conventions
2. Based on the input, identify the codebase areas likely affected:
   - Search for relevant modules, services, controllers, components
   - Identify existing patterns in those areas (how similar features were implemented)
   - Map dependencies between modules
   - Identify reusable utilities and helpers
3. Assess technical risks:
   - Areas with high complexity or coupling
   - Possible conflicts with existing code
   - Need for migrations or schema changes

### 3. Synthesize artifacts

With the results from both agents, create the following files in the feature folder:

#### `proposal.md`

```markdown
# <Feature Title>

## Source
- Origin: Linear <ID> | Free prompt
- Priority: <High | Medium | Low>
- Labels: <relevant labels>

## Why
<Problem this feature solves. Business context. User pain point.
This should be a detailed paragraph, not a one-liner.
Include the motivation behind the request and who benefits.>

## Requirements

### REQ-01: <Requirement Name>
<Detailed description of the requirement, including:
- What the system should do
- Expected behavior in normal conditions
- Edge cases and boundary conditions
- Constraints and limitations>

**Acceptance Criteria:**
- [ ] <Specific, testable, verifiable criterion>
- [ ] <Another criterion with clear pass/fail condition>

### REQ-02: <Requirement Name>
...

## Scope

### In Scope
- <What IS part of this delivery>
- <Be explicit to avoid scope creep>

### Out of Scope
- <What is explicitly NOT part of this delivery>
- <Things that might seem related but are deferred>

## Technical Context
- **Affected Areas:** <list of directories/files that will be touched>
- **Existing Patterns:** <how similar features are implemented in this codebase>
- **Dependencies:** <external libs, internal modules needed>
- **Risks:** <technical risks identified during exploration>
```

#### `design.md`

```markdown
# Design — <Feature Title>

## Architecture Overview
<How this feature fits into the existing architecture.
Describe the flow: request → controller → service → repository → response.
Or component → hook → API → state. Whatever fits the project.>

## Technical Decisions

### 1. <Decision Title>
**Choice:** <what was decided>
**Alternatives Considered:**
- <alternative A> — rejected because <reason>
- <alternative B> — rejected because <reason>
**Rationale:** <why this choice is the best fit for this context>

## Files to Create
| File | Purpose |
|------|---------|
| <path> | <what this file does> |

## Files to Modify
| File | Change |
|------|--------|
| <path> | <what changes and why> |

## Data Model Changes
<New collections/tables/schemas, migrations needed, or "None">

## API Changes
<New endpoints, changed contracts, or "None">

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| <risk> | <how to mitigate> |
```

#### `tasks.md`

```markdown
# Tasks — <Feature Title>

## 1. Implementation
- [ ] 1.1 <Specific, actionable task with enough detail to execute>
- [ ] 1.2 <Another task — one logical change each>
- [ ] 1.3 <...>
- [ ] 1.N Typecheck passing

## 2. Testing
- [ ] 2.1 Unit tests for <specific service/module/function>
- [ ] 2.2 Integration tests for <specific endpoint/flow>
- [ ] 2.3 E2E tests for <specific user flow> (if applicable)
- [ ] 2.4 All tests passing

## 3. Quality
- [ ] 3.1 Performance check passed
- [ ] 3.2 Security check passed
- [ ] 3.3 Code review passed

## 4. Delivery
- [ ] 4.1 User acceptance approved
- [ ] 4.2 PR created
- [ ] 4.3 Linear issue updated (if applicable)
```

### 4. Present to the user

After creating the 3 artifacts:
1. Present a clear summary of what was identified:
   - Number of requirements
   - Key technical decisions
   - Files to create/modify
   - Identified risks
2. If there are ambiguities or questions: ask them NOW, before proceeding
3. Ask: "Is the plan correct? Would you like to adjust anything?"

---

## Rules

- **Requirements must be specific**: "The system should validate email format" is better than "validation should work"
- **Acceptance criteria must be testable**: each one must have a clear pass/fail condition
- **Never fabricate requirements**: if the input is vague, ask. Do not assume.
- **Technical Context must reference real code**: cite existing files and patterns, not generic examples
- **Tasks must be atomic**: each task = one potential logical commit
- **Everything in English**: the artifacts (proposal.md, design.md, tasks.md) must be written in English
- **Always use parallel agents**: the Linear + codebase exploration MUST be parallel
