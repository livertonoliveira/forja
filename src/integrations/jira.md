# JiraProvider

Integration provider for Jira Cloud and Jira Data Center.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `baseUrl` | Yes | `https://your-org.atlassian.net` — must use HTTPS |
| `email` | Yes | Account email associated with the API token |
| `token` | Yes | Atlassian API token (generate at https://id.atlassian.com/manage-profile/security/api-tokens) |
| `projectKey` | Yes | Jira project key (e.g. `PROJ`) |

## Supported status names for updateIssue

Pass any transition name exactly as it appears in your Jira workflow. The lookup is **case-insensitive** and **dynamic** — IDs are never hardcoded.

```typescript
await provider.updateIssue('PROJ-42', { status: 'In Progress' })
await provider.updateIssue('PROJ-42', { status: 'Done' })
```

If the requested transition is not available in the current workflow, the error message lists the available options.

## closeIssue fallback order

`closeIssue` attempts these transition names in order until one succeeds:

1. `Done`
2. `Closed`
3. `Resolved`
4. `Completed`

| Workflow | Transition used |
|----------|----------------|
| Scrum (default) | Done |
| Kanban (default) | Closed |
| Custom with Resolved | Resolved |

If none of the fallbacks are available, a descriptive error lists the current transitions.

## Commonly supported status names

| Jira Workflow | Common transition names |
|---------------|------------------------|
| Scrum (default) | To Do, In Progress, Done |
| Kanban (default) | Open, In Progress, Closed |
| Bug tracking | Open, In Progress, Resolved, Closed |
| Custom | Varies — check your project's workflow configuration |
