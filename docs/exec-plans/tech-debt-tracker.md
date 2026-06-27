# Tech Debt Tracker

Last updated: 2026-06-17

## High Priority

| Topic | Why it matters | Source | Removal Condition |
|------|----------------|--------|-------------------|
| None | No high-priority MVP debt remains after final validation | N/A | N/A |

## Recently Closed

| Topic | Evidence | Closed |
|------|----------|--------|
| Historical InsightFlow LLM live smoke | Closed by the 2026-06-17 smoke, but the project-root `.env` path is now retired. Current live LLM validation must use FrameQ server Admin Web config plus server-managed checkout; desktop `.env` is limited to non-LLM local settings. | 2026-06-17 |

## Debt Handling Rules

- Add debt here when it spans more than one file or more than one task.
- Remove or downgrade debt when a change clearly addresses it.
- Link back to the plan, design doc, or code path that best explains the issue.
