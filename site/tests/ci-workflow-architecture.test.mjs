import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function workflow(name) {
  return readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
}

test('production Pages requires quality, browser and UI acceptance before publishing', () => {
  const pages = workflow('pages');
  assert.match(pages, /  release-quality:\n/);
  assert.match(pages, /  release-browser:\n/);
  assert.match(pages, /  release-ui-v2:\n/);
  assert.match(pages, /  stage-pages:\n/);
  assert.match(
    pages,
    /needs: \[release-evidence, release-quality, release-browser, release-ui-v2, release-science\]/,
  );
  assert.match(pages, /  release-evidence:\n/);
  assert.ok(pages.includes('run: node --test site/tests/release-evidence.test.mjs'));
  assert.match(pages, /if: .*needs.release-evidence.outputs.fast != 'true'/);
  assert.match(pages, /needs: \[stage-pages\]/);
  assert.match(pages, /run: node scripts\/local-verification\.mjs verify full/);
  assert.match(pages, /uses: \.\/\.github\/workflows\/browser-regression\.yml/);
  assert.match(pages, /uses: \.\/\.github\/workflows\/ui-v2-stage-c-m4\.yml/);
  assert.match(
    pages,
    /if: \$\{\{ always\(\) && !cancelled\(\) && github\.ref == 'refs\/heads\/main' && needs\.stage-pages\.result == 'success' \}\}/,
  );
  assert.match(pages, /uses: actions\/deploy-pages@v4/);
  assert.match(pages, /run: node scripts\/smoke-pages-artifact\.mjs/);
  assert.match(pages, /uses: actions\/upload-pages-artifact@v4/);
  assert.equal((pages.match(/pages: write/g) || []).length, 1, 'Only deploy has Pages write');
  assert.equal((pages.match(/id-token: write/g) || []).length, 1, 'Only deploy has OIDC write');
  assert.match(pages, /node scripts\/build-pages-artifact\.mjs/);
  assert.match(pages, /node scripts\/stamp-pages-assets\.mjs .*build\/pages/);
  assert.match(pages, /path: build\/pages/);
  const commitLines = pages.split('\n');
  const commitLine = commitLines.find((line) => line.includes('> build/pages/build-info.json'));
  assert.equal(
    commitLine?.trim(),
    String.raw`printf '{"commit":"%s"}\n' "$GITHUB_SHA" > build/pages/build-info.json`,
  );
});

test('Pages cannot silently skip publishing after an upstream optional suite skips', () => {
  const pages = workflow('pages');
  const stage = pages.split('  stage-pages:\n')[1]?.split('  deploy:\n')[0];
  assert.ok(stage, 'production stage job must exist');
  assert.match(
    stage,
    /if: \$\{\{ always\(\) && !cancelled\(\) && github\.ref == 'refs\/heads\/main' && needs\.release-evidence\.outputs\.mode != 'superseded' \}\}/,
  );
  for (const gate of ['QUALITY', 'BROWSER', 'UI_V2', 'SCIENCE']) {
    assert.match(stage, new RegExp(`\\b${gate}_RESULT:\\s*\\$\\{\\{ needs\\.`));
  }
  assert.match(stage, /test "\$EVIDENCE_RESULT" = success/);
  assert.match(stage, /if \[\[ "\$FAST" == true \]\]; then/);
  assert.match(stage, /expected=skipped/);
  assert.match(stage, /elif \[\[ "\$FAST" == false \]\]; then/);
  assert.match(stage, /expected=success/);
  assert.match(stage, /if \[\[ "\$result" != "\$expected" \]\]; then/);
  assert.match(stage, /exit 1/);
  assert.ok(
    stage.indexOf('Require proven fast release or successful full release gates') <
      stage.indexOf('Checkout verified revision'),
    'fail-closed release gate must precede artifact construction',
  );
});

test('Pages requires a real deploy and rejects false-green skipped publish jobs', () => {
  const pages = workflow('pages');
  const deploy = pages.split('  deploy:\n')[1]?.split('  release-verdict:\n')[0];
  const verdict = pages.split('  release-verdict:\n')[1];
  assert.ok(deploy, 'deploy job must exist');
  assert.ok(verdict, 'final release verdict job must exist');
  assert.match(deploy, /needs: \[stage-pages\]/);
  assert.ok(
    deploy.includes(
      "if: ${{ always() && !cancelled() && github.ref == 'refs/heads/main' && needs.stage-pages.result == 'success' }}",
    ),
    'explicit success status must allow a completed stage to run despite skipped optional upstream jobs',
  );
  assert.match(verdict, /needs: \[release-evidence, stage-pages, deploy\]/);
  assert.ok(
    verdict.includes("if: ${{ always() && github.ref == 'refs/heads/main' }}"),
    'final verdict must be evaluated even if the deployment was skipped',
  );
  assert.ok(verdict.includes('STAGE_RESULT: ${{ needs.stage-pages.result }}'));
  assert.ok(verdict.includes('DEPLOY_RESULT: ${{ needs.deploy.result }}'));
  assert.match(
    verdict,
    /"\$STAGE_RESULT" == success && "\$DEPLOY_RESULT" == success && "\$PUBLISHED" == true/,
  );
  assert.match(verdict, /exit 1/);
});

test('Main verification is independent while irreversible Pages publication is serialized', () => {
  const pages = workflow('pages');
  assert.match(pages, /group: pages-validation-\$\{\{ github\.sha \}\}/);
  assert.match(pages, /group: pages-publication/);
  assert.match(pages, /cancel-in-progress: false/);
  const release = pages.split('  deploy:\n')[1]?.split('  release-verdict:\n')[0];
  const verdict = pages.split('  release-verdict:\n')[1];
  assert.ok(release?.includes("ref: 'heads/main'"));
  assert.ok(release?.includes('ref.data.object.sha === context.sha'));
  assert.ok(release?.includes("if: ${{ steps.latest.outputs.current == 'true' }}"));
  assert.ok(verdict?.includes('PUBLISHED: ${{ needs.deploy.outputs.published }}'));
  assert.ok(verdict?.includes('SUPERSEDED: ${{ needs.deploy.outputs.superseded }}'));
  assert.ok(verdict?.includes('RELEASE_MODE: ${{ needs.release-evidence.outputs.mode }}'));
  assert.ok(verdict?.includes('exit 1'));
});

test('Pages scientific gate requires routed Main/Mask, KLayout and Recipe outcomes', () => {
  const pages = workflow('pages');
  assert.match(pages, /  release-impact:\n/);
  assert.match(pages, /  release-main-mask:\n/);
  assert.match(pages, /  release-klayout:\n/);
  assert.match(pages, /  release-recipe:\n/);
  assert.match(pages, /  release-science:\n/);
  assert.match(
    pages,
    /needs: \[release-evidence, release-impact, release-main-mask, release-klayout, release-recipe\]/,
  );
  assert.match(
    pages,
    /if: \$\{\{ always\(\) && needs\.release-evidence\.outputs\.fast != 'true' && needs\.release-evidence\.outputs\.mode != 'superseded' \}\}/,
  );
  assert.match(pages, /test "\$result" = success/);
  assert.match(pages, /test "\$result" = skipped/);
  for (const [job, path] of [
    ['release-main-mask', 'ui-v2-main-mask.yml'],
    ['release-klayout', 'klayout-compat.yml'],
    ['release-recipe', 'process-recipe-safety.yml'],
  ]) {
    assert.ok(pages.includes(`  ${job}:`));
    assert.ok(pages.includes(`uses: ./.github/workflows/${path}`));
    assert.match(workflow(path.replace(/\.yml$/, '')), /^  workflow_call:/m);
  }
});

test('browser and v2 owners are reusable without racing main-push jobs', () => {
  const browser = workflow('browser-regression');
  const ui = workflow('ui-v2-stage-c-m4');
  assert.match(browser, /^  workflow_call:/m);
  assert.match(ui, /^  workflow_call:/m);
  assert.doesNotMatch(browser, /^  push:/m);
  assert.doesNotMatch(ui, /codex\/ui-v2-main-wip/);
  assert.doesNotMatch(ui, /branches: \[codex\/ui-v2-main-wip, main\]/);
  assert.match(browser, /!inputs\.skip_node_gate/);
});

test('opt-in 625-site dispatch runs its scientific owner only, never the full matrix', () => {
  const browser = workflow('browser-regression');
  assert.match(browser, /  workflow_dispatch:\n    inputs:\n      run_scope:/);
  assert.match(
    browser,
    /default: full\n        options:\n          - full\n          - renderer-array/,
  );
  const plan = browser.split('  plan:\n')[1]?.split('  browser:\n')[0];
  assert.ok(plan, 'browser plan job must exist');
  assert.ok(
    plan.includes(
      '"${{ github.event_name }}" == "workflow_dispatch" && "${{ inputs.run_scope }}" == "renderer-array"',
    ),
  );
  assert.match(
    plan,
    /for suite in full smoke workstation resilience history persistence interaction examples product_layout process extended; do/,
  );
  assert.ok(plan.includes('echo \'renderer=true\' >> "$GITHUB_OUTPUT"'));
  assert.ok(plan.includes('echo \'extended_matrix=["none"]\' >> "$GITHUB_OUTPUT"'));
  assert.ok(
    plan.indexOf('inputs.run_scope') < plan.indexOf('inputs.force_full'),
    'manual-only branch precedes full fallback',
  );
  const smoke = browser.split('  browser:\n')[1]?.split('  release-ui-owners:\n')[0];
  const stress = browser.split('  renderer-array:\n')[1]?.split('  process-geometry:\n')[0];
  const edge = browser.split('  renderer-array-edge-on:\n')[1];
  assert.ok(
    smoke?.includes(
      "if: ${{ github.event_name != 'workflow_dispatch' || inputs.run_scope != 'renderer-array' }}",
    ),
  );
  assert.ok(stress?.includes("needs.plan.outputs.renderer == 'true'"));
  assert.ok(stress?.includes('node scripts/v2/check-source-sunset-renderer-stress.mjs'));
  assert.ok(
    stress?.includes(
      'site/tests/transparent-array-lod.test.mjs site/tests/renderer-geometry-cache.test.mjs',
    ),
  );
  assert.ok(
    edge?.includes(
      "github.event_name != 'workflow_dispatch' || inputs.run_scope != 'renderer-array'",
    ),
  );
  assert.doesNotMatch(browser, /^  pull_request:/m, 'no new automatic Browser workflow event');
});

test('retired preview cannot publish from the obsolete branch', () => {
  assert.equal(
    existsSync(new URL('../../.github/workflows/ui-v2-preview.yml', import.meta.url)),
    false,
  );
});

test('Quality covers docs-only PRs and fails closed through real fallback execution', () => {
  const quality = workflow('quality');
  assert.match(quality, /branches: \[main\]/);
  assert.doesNotMatch(quality, /paths-ignore:/);
  assert.match(quality, /run: node scripts\/local-verification\.mjs verify/);
  assert.match(quality, /continue-on-error: true/);
  assert.match(quality, /steps\.evidence\.outcome != 'success'/);
  assert.match(quality, /run: npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(quality, /run: npm run check/);
});

test('manual reconstruction runs cannot mutate main', () => {
  const m3d = workflow('m3d-full-replay');
  assert.match(m3d, /  replay:\n    if: \$\{\{/);
  assert.ok(m3d.includes("github.ref_name == 'fix/m3d-conformal-microcracks-20261008'"));
  assert.ok(m3d.includes("github.ref_name == 'integrate/reviewed-branches-20261008'"));
  const magic = workflow('magic1000-candidate');
  assert.match(magic, /  workflow_dispatch:/);
  assert.doesNotMatch(magic, /^  pull_request:/m);
  assert.match(magic, /permissions:\n  contents: read/);
  assert.doesNotMatch(magic, /contents: write|git push|feat\/magic-1000-mos2-beol-reconstruction/);
  assert.match(magic, /node scripts\/magic1000-visual-acceptance\.mjs/);
  assert.ok(
    workflow('photodetector-reconstruction-v2').includes(
      "if: ${{ github.ref_name == 'fix/photodetector-reconstruction-v2' }}",
    ),
  );
});

test('M3D baseline retains scientific and visual owners without duplicate generic Quality', () => {
  const m3d = workflow('m3d-conformal-baseline');
  assert.match(m3d, /^  scientific-baseline:/m);
  assert.match(m3d, /^  approved-windows-visual-baseline:/m);
  assert.doesNotMatch(m3d, /^  quality:/m);
  assert.doesNotMatch(m3d, /npm run lint|npm run format:check|npm run docs:check/);
  assert.doesNotMatch(m3d, /m3d-conformal-baseline\.yml/);
});

test('manual pre-main validates full proof or runs full Quality before real browser acceptance', () => {
  const preMain = workflow('pre-main-integration-validation');
  assert.match(preMain, /node scripts\/local-verification\.mjs verify full/);
  assert.ok(
    preMain.indexOf('run: node scripts/local-verification.mjs verify full') <
      preMain.indexOf('run: npm ci --ignore-scripts --no-audit --no-fund'),
    'the proof probe must precede npm install',
  );
  assert.match(preMain, /continue-on-error: true/);
  assert.match(preMain, /steps\.evidence\.outcome != 'success'/);
  assert.match(
    preMain,
    /name: Final lint, formatting, generated documentation and Node tests[\s\S]*?run: npm run check/,
  );
  assert.match(preMain, /npm run test:ui:all/);
});
