import { launchBrowser, waitForPaint } from '../../../scripts/test-helpers/ui.mjs';
const browser = await launchBrowser();
try {
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto('http://127.0.0.1:4182/app-v2-mask.html');
  await page.waitForFunction(()=>window.WaferCadV2Mask?.ready);
  const button=page.locator('[data-action="tool:zoom:mask"]');
  await button.click();
  const b=await button.boundingBox();
  const read=()=>page.evaluate(()=>window.WaferCadV2Mask.snapshot());
  const before=await read();
  const toolbarTarget=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button')?.dataset.action,{x:b.x+b.width/2,y:b.y+b.height/2});
  await page.mouse.wheel(0,-100); await waitForPaint(page);
  const overToolbar=await read();
  const c=await page.locator('#maskCanvas').boundingBox();
  await page.mouse.move(c.x+c.width*.25,c.y+c.height*.7);
  const canvasTarget=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x:c.x+c.width*.25,y:c.y+c.height*.7});
  await page.mouse.wheel(0,-100); await waitForPaint(page);
  const overCanvas=await read();
  console.log(JSON.stringify({toolbarTarget,canvasTarget,before:before.plan,overToolbar:overToolbar.plan,overCanvas:overCanvas.plan,zoomEnabled:overCanvas.zoomEnabled},null,2));
} finally {await browser.close();}
