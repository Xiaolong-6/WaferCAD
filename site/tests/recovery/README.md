# Workspace and Project Recovery Node tests

This directory owns project-controller Recovery semantics, workspace storage/restore worker roundtrips and dirty-domain persistence checks. The original assertions are unchanged; relative module imports are updated for their new paths.

The original `npm test` glob remains `site/tests/*.test.mjs`. `site/tests/recovery-suite.test.mjs` discovers **all** nested `*.test.mjs` files and checks the four mandatory owners, preventing silent loss when a nested test is added.

History replay, rollback and fault-matrix tests are owned by `site/tests/history/`. Cross-domain snapshot and IO tests stay flat until independently reviewed. Browser Recovery tests and approved fixture data also remain in their original locations. Do not loosen atomicity, project integrity or restore assertions as a consequence of file organization.

See [test layout](../README.md) and [test contracts](../../../docs/testing.md).
