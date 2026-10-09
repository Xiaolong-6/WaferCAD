// Real WaferCAD UI acceptance: import paper-derived Metalens project,
// rebuild every Step from clean Base using its captured file Mask, then export.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildMetalensLocal } from './build-tio2-metalens-example.mjs';
import { exportCurrentProject, loadProject } from './test-helpers/product-scientific.mjs';
import {
  baseUrl,
  chooseConfirmation,
  launchBrowser,
  newUiContext,
  observePageErrors,
  openFunctionPanel,
  waitForAppReady,
} from './test-helpers/ui.mjs';


const browser=await launchBrowser();
const context=await newUiContext(browser, { viewport:{width:1400,height:900},acceptDownloads:true });
const page=await context.newPage(), errors=observePageErrors(page);
try {
  const {project}=await buildMetalensLocal();
  const { pointInMulti } = await import('../site/vector-geometry.js');
  await page.goto(baseUrl+'/app.html',{waitUntil:'domcontentloaded',timeout:30000});
  await waitForAppReady(page);
  await loadProject(page,project,'TiO2-metalens-four-unit');
  await openFunctionPanel(page,'process');
  await page.locator('[data-process-input-mode="recipe"]').click();
  const rows=page.locator('.recipe-step-row');
  assert.equal(await rows.count(),project.processRecipe.steps.length);
  await page.locator('#recipeRunStart').selectOption('new-base');
  const errorText=await page.locator('#recipeValidation').innerText();
  assert.doesNotMatch(errorText,/✕|material.*missing|mask.*missing/i);
  await page.locator('#recipeRunAllBtn').click();
  await chooseConfirmation(page,'clear');
  await page.waitForFunction(()=>{
    const summary=document.getElementById('recipeRunSummary')?.textContent||'';
    return /^(Completed|Failed|Stopped):/.test(summary);
  },null,{timeout:180000});
  const summary=(await page.locator('#recipeRunSummary').innerText()).trim();
  assert.match(summary,/^Completed: 9\/9 steps committed/,
    'Failed to rebuild from Base: '+summary);
  const rebuilt=await exportCurrentProject(page,120000);
  assert.equal(rebuilt.snapshotBranches.branches.length,1);
  assert.ok(rebuilt.snapshotBranches.nodes.length>=9);
  assert.equal(rebuilt.processRecipe.steps.length,9);
  const sample=(model,position)=>{
    const region=model.regions.find(r=>pointInMulti(position,r.geom));
    return region?.stack?.map(s=>model.layers.find(l=>l.id===s.layerId)?.name) || [];
  };
  for(const xy of [[-1.1,-1.1],[1.1,-1.1],[-1.1,1.1],
    [-1.1+0.135,1.1],[1.1,1.1],[1.1+0.078,1.1],[0,0]]) {
    assert.deepEqual(sample(rebuilt.model,xy),sample(project.model,xy),
      'Run All differs at probe '+JSON.stringify(xy));
  }
  await mkdir('test-results/metalens',{recursive:true});
  await writeFile('test-results/metalens/runall-browser-report.json',
    JSON.stringify({pass:true,summary,historyNodes:rebuilt.snapshotBranches.nodes.length,
      sections:'Process UI and project export verified',probes:7},null,2)+'\n');
  await page.screenshot({path:'test-results/metalens/recipe-runall-actual.png'});
  assert.deepEqual(errors,[], 'Unexpected browser errors');
  console.log('TiO2 Metalens local Recipe Run All SUCCESS: '+summary);
} finally {
  await context.close();
  await browser.close();
}
