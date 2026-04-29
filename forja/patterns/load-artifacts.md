# Load Artifacts

Matrix of artifact loading by context and storage mode:

| Context | Linear mode | Local mode |
|---------|------------|------------|
| **Pipeline phase** (develop, perf, security, review) | `get_issue` + `get_document(Design)` + optionally `get_document(Proposal)` | `proposal.md` + `design.md` + `tasks.md` |
| **Orchestration** (run, homolog) | `get_issue` + `list_documents` → `get_document(Proposal)` + `get_document(Design)` | `proposal.md` + `design.md` + `tasks.md` + `report.md` |
| **PR** (`/forja:pr`) | `get_issue` + `get_document(Proposal)` + `get_document(Design)` + `list_comments` | `proposal.md` + `design.md` + `tasks.md` + `report.md` |
| **Audit** | `forja/config.md` only | `forja/config.md` only |

All contexts also read `forja/config.md` for stack and conventions.
