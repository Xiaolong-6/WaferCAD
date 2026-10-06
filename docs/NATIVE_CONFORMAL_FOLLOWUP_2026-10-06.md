# Native Conformal follow-up — 2026-10-06

The user-requested tier-2 checkpoint was loaded unchanged in installed, visible Chrome. Native export before Apply was model-deep-equal to the input. Exact operation: L9, 0.01 µm (10 nm), Conformal, front face, `T2 HfO2 gate`.

Before this fix, the worker computes a candidate and strict validation rejects an overlap at the S/D pad corners (2.92995e-7 µm²). Independent kernel replay reproduces it. Instrumentation shows the native wall partition is valid before post-operation numerical crack healing, which introduces the overlap. Model, History and bookmarks remain exactly unchanged after rejection.

When Conformal reports numerical cracks, the fix first checks the runtime partition at the existing strict overlap tolerance, then normalizes the shared 0.1 nm persistence grid using the checked process partition routine. It avoids unioning a derived crack into one unsnapped owner. Genuine runtime overlaps still fail safely. Storage precision, Z thickness and validator tolerance are unchanged. A synthetic step-geometry test independently exercises a false uncovered-domain crack across two material owners; no user checkpoint data is included in that test.

The exact T2 native Conformal step now passes in Chrome and native export/reopen. It retains 10 nm channel/pad films and finite-height physical S/D sidewalls. T2 40.4 nm gate metal, material-selective contact windows and the forming-gas record also pass. History advances from 22 to 26 Steps. No horizontal HfO2 proxy is used for these new Steps.

The next native ILD2 HfO2 liner (20 nm) still fails safely on a runtime overlap of 6.3484e-7 µm², with History preserved at 26 Steps. A diagnostic-only pre-coating normalization removes that runtime overlap but native export still rejects a snapped partition overlap. That diagnostic variant is not installed. ILD2/T3 completion is not claimed.

Local validation: full Node inventory passed 373 tests before adding the passing synthetic crack regression; zero failures/skips. Full Process geometry browser regression and lint pass. The exact checkpoint archive, its additional local regression, UI downloads and traces remain local pending upload authorization. The shared synthetic regression and kernel fix can be pushed independently of that engineering payload.
