# Native Conformal follow-up — 2026-10-06

The user-requested tier-2 checkpoint was loaded unchanged in installed, visible Chrome. Native export before Apply was model-deep-equal to the input. Exact operation: L9, 0.01 µm (10 nm), Conformal, front face, `T2 HfO2 gate`.

Before this fix, the worker computes a candidate and strict validation rejects an overlap at the S/D pad corners (2.92995e-7 µm²). Independent kernel replay reproduces it. Instrumentation shows the native wall partition is valid before post-operation numerical crack healing, which introduces the overlap. Model, History and bookmarks remain exactly unchanged after rejection.

When Conformal reports numerical cracks, the fix first checks the runtime partition at the existing strict overlap tolerance, then normalizes the shared 0.1 nm persistence grid using the checked process partition routine. It avoids unioning a derived crack into one unsnapped owner. Genuine runtime overlaps still fail safely. Storage precision, Z thickness and validator tolerance are unchanged. A synthetic step-geometry test independently exercises a false uncovered-domain crack across two material owners; no user checkpoint data is included in that test.

The exact T2 native Conformal step now passes in Chrome and native export/reopen. It retains 10 nm channel/pad films and finite-height physical S/D sidewalls. T2 40.4 nm gate metal, material-selective contact windows and the forming-gas record also pass. History advances from 22 to 26 Steps. No horizontal HfO2 proxy is used for these new Steps.

The next native ILD2 HfO2 liner (20 nm) still fails safely on a runtime overlap of 6.3484e-7 µm², with History preserved at 26 Steps. A diagnostic-only pre-coating normalization removes that runtime overlap but native export still rejects a snapped partition overlap. That diagnostic variant is not installed. ILD2/T3 completion is not claimed.

Local validation: full Node inventory passed 373 tests before adding the passing synthetic crack regression; zero failures/skips. Full Process geometry browser regression and lint pass. The user explicitly authorized uploading the complete checkpoint after automatic review initially blocked that payload. Its byte-exact 22 KB Brotli archive, metadata and additional native film/sidewall/export regression are committed in tests/fixtures/native-fig3 and site/tests/fig3-native-conformal.test.mjs. UI downloads and detailed traces remain local.

Validation for the ILD2 fix: full Node inventory 374 passed, zero failures/skips; full Process Geometry browser regression and ESLint passed on Windows / Node 24.19.0 / Playwright 1.55.1 / pinned Chromium with Three 0.179.1. Installed Chrome 154.0.8037.98 is used for the reconstruction. Both localhost 4173 and 4174 serve this checkout; the stale original-checkout 4173 server was stopped at the user request. Feature-branch commits continue to use [skip ci].
