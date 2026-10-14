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
    /needs: \[release-quality, release-browser, release-ui-v2, release-science\]/,
  );
  assert.match(pages, /needs: \[stage-pages\]/);
  assert.match(pages, /run: npm run check/);
  assert.match(pages, /uses: \.\/\.github\/workflows\/browser-regression\.yml/);
  assert.match(pages, /uses: \.\/\.github\/workflows\/ui-v2-stage-c-m4\.yml/);
  assert.match(pages, /if: \$\{\{ always\(\) && !cancelled\(\) && github\.ref == 'refs\/heads\/main' \}\}/);
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
    /if: \$\{\{ always\(\) && !cancelled\(\) && github\.ref == 'refs\/heads\/main' \}\}/,
  );
  for (const gate of ['QUALITY', 'BROWSER', 'UI_V2', 'SCIENCE']) {
    assert.match(stage, new RegExp(`\\b${gate}_RESULT:\\s*\\$\\{\\{ needs\\.`));
  }
  assert.match(stage, /if \[\[ "\$result" != success \]\]; then/);
  assert.match(stage, /exit 1/);
  assert.ok(
    stage.indexOf('Require successful same-revision release gates') <
      stage.indexOf('Checkout verified revision'),
    'fail-closed release gate must precede artifact construction',
  );
});

test('Pages deploy job runs after a skipped optional dependency and refuses missing staging', () => {
  const pages = workflow('pages');
  const deploy = pages.split('  deploy:\n')[1];
  assert.ok(deploy, 'production deployment job must exist');
  assert.match(deploy, /needs: \[stage-pages\]/);
  assert.match(
    deploy,
    /if: \$\{\{ always\(\) && !cancelled\(\) && github\.ref == 'refs\/heads\/main' \}\}/,
  );
  assert.match(deploy, /STAGE_RESULT: \$\{\{ needs\.stage-pages\.result \}\}/);
  assert.match(deploy, /if \[\[ "\$STAGE_RESULT" != "success" \]\]; then/);
  assert.match(deploy, /exit 1/);
  assert.ok(
    deploy.indexOf('Require successful staged artifact before publishing') <
      deploy.indexOf('actions/configure-pages@v5'),
    'a skipped or failed stage must be rejected before configuring production deployment',
  );
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
    /needs: \[release-impact, release-main-mask, release-klayout, release-recipe\]/,
  );
  assert.match(pages, /if: \$\{\{ always\(\) \}\}/);
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

test('retired preview cannot publish from the obsolete branch', () => {
  assert.equal(
    existsSync(new URL('../../.github/workflows/ui-v2-preview.yml', import.meta.url)),
    false,
  );
});

test('Quality covers docs-only PRs and enforces pinned formatter', () => {
  const quality = workflow('quality');
  assert.match(quality, /branches: \[main\]/);
  assert.doesNotMatch(quality, /paths-ignore:/);
  assert.match(quality, /run: npm run check\n/);
});

test('manual reconstruction runs cannot mutate main', () => {
  const m3d = workflow('m3d-full-replay');
  assert.match(m3d, /  replay:\n    if: \$\{\{/);
  assert.ok(m3d.includes("github.ref_name == 'fix/m3d-conformal-microcracks-20261008'"));
  assert.ok(m3d.includes("github.ref_name == 'integrate/reviewed-branches-20261008'"));
  assert.ok(
    workflow('magic1000-candidate').includes(
      "if: ${{ github.ref_name == 'feat/magic-1000-mos2-beol-reconstruction' }}",
    ),
  );
  assert.ok(
    workflow('photodetector-reconstruction-v2').includes(
      "if: ${{ github.ref_name == 'fix/photodetector-reconstruction-v2' }}",
    ),
  );
});
