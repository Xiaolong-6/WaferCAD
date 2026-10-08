# Rendering and audit stabilization — 2026-10-05

> **Revision-specific evidence.** This record describes its original date, branch and validation scope. It does not establish current main status. Use the [documentation map](README.md) and [archive index](archive/README.md) for current contracts and later evidence.

This follow-up starts from product `8d0abae` and fixes the confirmed runtime findings from `codex/project-audit-2026-10-05`, plus the subsequently reported Photodetector Section Detail mismatch. The original audit and before/after observations remain on the audit branch. Consult that branch's report for exact checked and published commits.

## Behavior

- New editor documents receive independent autosave identities even when the browser copies `sessionStorage`. A same-tab reload retains its identity. A copied tab remains read-only until explicit takeover; its unsaved edits cannot overwrite the owner. The Chromium native Duplicate-tab API was also exercised in an isolated test extension/profile: its navigation type was `back_forward`, with separate identities and one writer.
- Directional Add/Grow checks for eligible horizontal surfaces before creating a layer or updating revision. A sidewall-only selection returns no-change without changing material, layer counters, morphology, History Steps, Variant HEADs or cursors. Both faces and operations are covered; mixed horizontal/sidewall deposition still succeeds.
- Playwright is pinned to `1.55.1`, with matching lockfile and workflow cache keys. The installed Windows Chromium is `140.0.7339.186`, build `1193`; Three stays `0.179.1`. The dependency audit reports zero vulnerabilities.
- Section Si, ALD and Implant trace a common screen-space sampling lattice. Detail rendering spends its sample budget on the visible interval. Previously each band sampled independently across the entire wafer, causing registration errors at magnification.
- Rough Implant concentration now follows local source height instead of one band-wide average gradient. Thin ALD sidewall visibility aids retain their rough floor rather than extending an ideal rectangle into Si. Display changes do not mutate canonical material or saved History. Real differences between implants created on distinct source surfaces remain meaningful.

3D already interpolates annotation depth attributes while displacing the rough sidewall geometry; this fix addresses the remaining Canvas registration and local-gradient paths. The previous ROI-border and zero artificial 3D collapse-gap contracts remain covered by renderer review.

## Validation

Windows / Node `24.16.0` / Playwright `1.55.1` / Chromium build `1193` / local Three `0.179.1`; real WebGL uses SwiftShader. Serve `site/` on port `4173` and set `WAFERCAD_THREE_DIR` to `node_modules/three`.

- `npm run check`: lint, format and 321 Node tests pass; none skipped.
- `npm run test:ui:all`: all ten non-baseline browser suites pass in the final clean run, including 109 product layout captures, 17 renderer captures and the new Detail contracts. Persistence, Process and renderer review also passed separately during stabilization.
- The Detail contract records production Canvas paths and gradients in Chromium: 184 visible profile samples and 272 checked local gradient columns in the wide probe. It checks ALD/Si registration, retained film thickness, Implant/Si registration, local concentration depth, and the widened sidewall floor. The old main renderer fails the Implant registration assertion as a negative control.
- Before/after audit observations, including real opener and native duplicate-tab probes, are committed on the audit branch. All four no-change probes return `changed: false` with unchanged physical material, layer count and revision.

## Visual reference status

The four Project/Main/phone Windows references pass unchanged. The existing Photodetector Section reference differs by `0.011391` (about 1.14% of pixels), above the `0.0005` threshold, because of the intentional profile/gradient correction. This opt-in comparison is therefore **not passing against the old approved set**.

The corrected candidate was inspected and all five candidate images passed comparison in two subsequent runs. The old renderer, served as a control on the same patched Chromium, still passes all five original references, isolating this difference to the intended renderer change. Candidate repeats establish local stability; they do not constitute human acceptance. The approved PNGs and their thresholds were not replaced. The candidate and before/after/diff images are retained with the audit evidence for review; after human acceptance, update only the Photodetector Windows reference. Visual comparison remains outside `test:ui:all` and CI. No Linux browser baseline or manual full CI run was executed.

Local logs and full galleries are ignored under `test-results/audit-fix-*`, `test-results/product-review/`, `test-results/visual-diff/` and `test-results/visual-review-profile-fix/`. Shared ChatGPT/Codex work should use the committed report/evidence and exact revision, following [Collaboration](COLLABORATION.md).
