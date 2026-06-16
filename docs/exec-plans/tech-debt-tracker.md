# Tech Debt Tracker

Last updated: 2026-06-16

## High Priority

| Topic | Why it matters | Source | Removal Condition |
|------|----------------|--------|-------------------|
| Real Qwen3-ASR inference not verified | Adapter and writers are tested, but model weights have not been downloaded or executed on the sample WAV | `docs/exec-plans/active/2026-06-16-mvp-desktop-client-plan.md` | Run Qwen3-ASR on `work/7524373044106677544.wav` and replace fake transcript validation with real output |

## Medium Priority

| Topic | Why it matters | Source | Removal Condition |
|------|----------------|--------|-------------------|
| TypeScript lint config is minimal until `app/` exists | The repo has no Tauri app yet, so frontend lint rules cannot be verified against real code | Project launch | Replace with project-specific ESLint config after app scaffold is created and lint passes |

## Debt Handling Rules

- Add debt here when it spans more than one file or more than one task.
- Remove or downgrade debt when a change clearly addresses it.
- Link back to the plan, design doc, or code path that best explains the issue.
