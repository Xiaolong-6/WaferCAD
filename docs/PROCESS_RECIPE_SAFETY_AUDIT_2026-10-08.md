# Process Recipe safety review — 2026-10-08

Base: `fix/photodetector-reconstruction-v2`. Work branch: `fix/process-recipe-safety-r1-r7`.

## Scope and verification

The user-supplied Edge review (R1–R7) was assessed against the current Recipe implementation. All remediation uses synthetic test inputs; no private OAS or process recipe was checked in.

| Finding | Change | Regression |
|---|---|---|
| R1 (P1) draft discarded | Code editor retains unapplied content across Steps/Code and failed Format. Format only serializes after successful Apply code. | Browser draft/format switching |
| R2 (P1) Validate approves old values | Bad step input persists as a field error; visible Code is parsed on Validate and unapplied Code blocks Run. | Browser negative/invalid length and Code draft |
| R3 (P1) invalid run rebuilds Base | Preflight runs before Base/history actions, with selected starting-state policy. Freeze Recipe controls during the async confirmation. | Browser invalid Run All + Base |
| R4 (P2) later failure blocks a valid prefix | Validate only the requested execution prefix for Replay 1→Step. | Unit prefix + browser first-Step replay |
| R5 (P2) displayed mask key differs | Normalize layer/datatype slash notation to pipe keys and validate selected layers/cell against the loaded layout. | Unit mask-key resolution |
| R6 (P2) completion indicators vanish | Retain committed-prefix outcome and failed Step, tied to Recipe signature and exact model identity (weakly referenced). Explicitly label prefix execution as replay. | Browser completion-marker persistence |
| R7 (P1 investigation) private OAS stalls | Yield between process Steps, keep Stop operable, and test Stop on 40 synthetic whole-face deposit steps. **Not a reproduction of the private OAS issue.** | Browser Stop stress guard |

## Verification commands

With dependencies installed and Chromium available:

```sh
npm run check:ci
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
node scripts/process-recipe-safety-regression.mjs
```

The branch CI workflow runs both checks automatically. It does not establish scientific fidelity of imported private OAS layout processing.

## Remaining work before promoting PR

1. Reproduce R7 with the private fixture in a local, non-committed workspace.
2. Profile the first mask-driven operation after Base rebuild (mask selection, large geometry, History, render pipeline).
3. Demonstrate that Stop remains clickable during actual layout-dependent work and document any failure path.
4. Do not merge this draft PR into the example branch or main until the private-path acceptance and code review are complete.
