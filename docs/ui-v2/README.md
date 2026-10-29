# Production Workstation documentation

## Current contract

- [Workstation shell, slots, state and transaction ownership](WORKSTATION_CONTRACT.md).
- [Core module architecture](../ARCHITECTURE.md).
- [History/Variants/Recovery user workflow](../wiki/History-Variants-and-Recovery.md).
- [Renderer/Section/3D boundaries](../renderer/RENDERER_CONTRACT.md).

## Focused implementation and open design constraints

- [Mobile Workstation layout](MOBILE_WORKSTATION_LAYOUT_2026-10-13.md).
- [Mobile CSS ownership audit](MOBILE_CSS_OWNERSHIP_AUDIT_2026-10-16.md).
- Contextual help is owned by the [current Workstation contract](WORKSTATION_CONTRACT.md); [original Tooltip rollout](../archive/ui-v2/TOOLTIP_ARCHITECTURE_2026-10-13.md) retains dated coverage and acceptance evidence.
- [Z Break editor](Z_BREAK_EDITOR_2026-10-13.md) — current presentation rules with clearly bounded 2026-10-13 implementation evidence.

## Historical implementation evidence, not current selectors or merge gates

- [Original M0 DOM inventory](../archive/ui-v2/CONTRACT.md).
- [Main extraction and budget checkpoint (2026-10-11)](../archive/ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md).
- [PR #188 progressive startup record](../archive/ui-v2/PROGRESSIVE_STARTUP_2026-10-13.md).
- [Manual Both acceptance checkpoint](../archive/ui-v2/MANUAL_BOTH_ACCEPTANCE_2026-10-12.md).
- [Completed desktop docking implementation](../archive/ui-v2/DESKTOP_DOCKING_PLAN_2026-10-15.md).
- [Completed edge-to-edge integration](../archive/ui-v2/EDGE_TO_EDGE_WORKSTATION_2026-10-15.md).

These records preserve original tested revisions and failure conditions.
Do not interpret a historical "Draft" instruction or old DOM ID as the
current production source contract. For release rules see [CI](../CI.md).
