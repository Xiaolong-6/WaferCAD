# Exported symbol ownership review (2026-10-13)

## Scope

The site symbol audit identified eight exports without recognized static
module consumers on the reviewed main revision. The classifier does **not**
prove an exported function is dead: in-file use, dynamic imports,
browser bindings, worker protocols and downstream integrations are distinct
from static imports.

| Source                            | Export                        | Review finding                                                                                                           |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `site/process-boundary-index.js`  | `prepareModelBoundaryIndexes` | No recognized internal reader; exported prewarm helper. Preserve until downstream and module API contracts are assessed. |
| `site/renderer-line-reduction.js` | `simplifyDisplayPolyline`     | Used internally by open and closed display-chain simplification; keep current implementation.                            |
| `site/report-history-captures.js` | `MAX_HISTORY_SVG_TOTAL_BYTES` | Enforces the live aggregate SVG byte budget for offline report captures; keep.                                           |
| `site/ui-v2/main-runtime.js`      | `formatMainPosition`          | Unused display formatting alias; preserve until UI v2 API ownership is confirmed.                                        |
| `site/workspace-persistence.js`   | `clearWorkspaceState`         | Unreferenced public persistence clear API; keep until Recovery and cross-tab compatibility are verified.                 |
| `site/workspace-snapshots.js`     | `MAX_SNAPSHOT_BRANCHES`       | Live Variant branch-count default and possible external configuration reference; keep.                                   |
| `site/workspace-snapshots.js`     | `MAX_PROCESS_HISTORY_NODES`   | Live History-node limit and possible external configuration reference; keep.                                             |
| `site/workspace-snapshots.js`     | `MAIN_SNAPSHOT_BRANCH_ID`     | Live stable branch identity used throughout History/Variants; keep.                                                      |

## Decision

**Retain all eight exports in this review.** Five are actively used inside
their own modules: `simplifyDisplayPolyline`,
`MAX_HISTORY_SVG_TOTAL_BYTES`, `MAX_SNAPSHOT_BRANCHES`,
`MAX_PROCESS_HISTORY_NODES`, and `MAIN_SNAPSHOT_BRANCH_ID`.
Three have no recognized in-module readers:
`prepareModelBoundaryIndexes`, `formatMainPosition`, and
`clearWorkspaceState`. Those three require explicit downstream/consumer
contract review before removal, especially persistence and UI v2 interfaces.

The associated Node test asserts these exports remain visible to the audit
as review candidates, and verifies known live same-module users. This is a
contract review guard, not proof of complete call-graph coverage.

## Limitations and exit criteria

Do not remove a symbol before confirming external imports and dynamically
constructed module paths; M2/D1 acceptance ownership; persisted History
and Recovery compatibility; and any worker or module boundary exposure.
After an approved retirement, update both this review and its scoped test.
No science, export, or runtime implementation was changed in this track.
