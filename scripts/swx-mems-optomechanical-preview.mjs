/**
 * Browser-rendered isolated scientific preview, NOT a WaferCAD device state.
 * This draws exactly the candidate mask polygons to make connectivity and
 * topology legible before project/Recipe integration. No baseline approval.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createSwxOptomechanicalCandidate } from './swx-mems-optomechanical-candidate.mjs';

const dir = resolve('test-results/swx-mems');
await mkdir(dir, { recursive: true });
const pathD = (ring) =>
  ring.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(5) + ',' + y.toFixed(5)).join(' ') + ' Z';
const shapes = (polygons, fill, opacity = 1) =>
  polygons
    .map(
      (polygon) =>
        '<path d="' + pathD(polygon) + '" fill="' + fill + '" fill-opacity="' + opacity + '"/>',
    )
    .join('\n');
const grid = [];
for (let i = -100; i <= 40; i += 10) {
  grid.push(
    '<line x1="-75" x2="75" y1="' + i + '" y2="' + i + '" stroke="#313b49" stroke-width=".06"/>',
  );
}
for (let i = -70; i <= 70; i += 10) {
  grid.push(
    '<line x1="' + i + '" x2="' + i + '" y1="-102" y2="46" stroke="#313b49" stroke-width=".06"/>',
  );
}
const browser = await chromium.launch({ headless: true });
try {
  for (const state of ['off', 'on']) {
    const model = createSwxOptomechanicalCandidate(state);
    const content = [
      shapes(model.fixed, '#56c5b3'),
      shapes(model.movable, '#e8a760'),
      shapes(model.flexure, '#ae9afe', 0.92),
    ].join('\n');
    // 5.75 px/um; invert Y so the spring anchor is at the top.
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="1060" viewBox="0 0 1120 1060">',
      '<rect width="1120" height="1060" fill="#111b28"/>',
      '<text x="52" y="56" font-family="Arial" font-size="27" font-weight="bold" fill="#f4f6fa">SWX compact optomechanical candidate — ' +
        state.toUpperCase() +
        '</text>',
      '<text x="52" y="89" font-family="Arial" font-size="15" fill="#b6bfce">Isolated polygon silhouette; original author GDS / fabrication History / FEM / FDTD NOT validated</text>',
      '<g transform="translate(560,382) scale(5.7,-5.7)">',
      '<g>' + grid.join('') + '</g>',
      content,
      '</g>',
      '<rect x="788" y="115" width="293" height="250" rx="8" fill="#202e42" stroke="#73849a" stroke-width="1.3"/>',
      '<text x="799" y="141" font-family="Arial" font-size="17" fill="#f4f6fa">SWT facet detail · ' +
        (state === 'off' ? '900 nm' : '15 nm') +
        ' gap</text>',
      // The same model polygon data is re-rendered at closer scale; the
      // 15nm ON distance is a numerical contract, not a pixel metrology.
      '<svg x="802" y="153" width="264" height="195" viewBox="-2 -49 4 2.3">',
      '<g transform="translate(0,-96) scale(1,-1)">',
      shapes([model.optics.fixedFacetsAndPorts[0]], '#56c5b3'),
      shapes([model.optics.movableFacetsAndPorts[0]], '#e8a760'),
      '</g></svg>',
      '<text x="52" y="1014" font-family="Arial" font-size="17" fill="#56c5b3">■ Stationary silicon</text>',
      '<text x="315" y="1014" font-family="Arial" font-size="17" fill="#e8a760">■ Moving silicon</text>',
      '<text x="550" y="1014" font-family="Arial" font-size="17" fill="#ae9afe">■ Compliant waveguides / springs</text>',
      '</svg>',
    ].join('\n');
    const svgPath = resolve(dir, 'swx-compact-optomechanical-' + state + '.svg');
    await writeFile(svgPath, svg);
    const page = await browser.newPage({
      viewport: { width: 1120, height: 1060 },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(svgPath).href);
    await page.screenshot({
      path: resolve(dir, 'swx-compact-optomechanical-' + state + '.png'),
      animations: 'disabled',
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('Generated isolated OFF and ON polygon previews in ' + dir);
