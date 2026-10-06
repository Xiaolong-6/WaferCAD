import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandProjectStorage } from '../../site/project-io.js';
import { chooseConfirmation, closeFunctionPanel, openFunctionPanel } from './product.mjs';

export async function loadProject(page, project, name) {
  await openFunctionPanel(page, 'project');
  await page.locator('#openProjectInput').setInputFiles({
    name: `${name}.wafercad`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await chooseConfirmation(page);
  await page.waitForFunction(
    (filename) => document.querySelector('#statusText').textContent === `Opened ${filename}.`,
    `${name}.wafercad`,
  );
  await closeFunctionPanel(page);
}

export async function exportCurrentProject(page, timeout = 30000) {
  await openFunctionPanel(page, 'project');
  const downloadPromise = page.waitForEvent('download', { timeout });
  await page.locator('#exportProjectBtn').click();
  const download = await downloadPromise,
    path = await download.path();
  assert.ok(path, 'Project export must produce a readable file.');
  const project = expandProjectStorage(JSON.parse(await readFile(path, 'utf8')));
  await closeFunctionPanel(page);
  return project;
}

export async function checkSectionSeams(page, project) {
  // Probe a row inside the Base interval shared by all material regions.
  // This remains valid when back-side coatings extend below the Base.
  const baseCommonLo = Math.max(
    ...project.model.regions
      .map((region) => region.stack.find((segment) => segment.layerId === 'base')?.z0)
      .filter(Number.isFinite),
  );
  const colors = await page.evaluate((baseCommonLo) => {
    const canvas = document.querySelector('#sectionCanvas'),
      dpr = Math.min(devicePixelRatio || 1, 2),
      width = canvas.width / dpr,
      z0 = Number(canvas.dataset.sectionZ0Um),
      z1 = Number(canvas.dataset.sectionZ1Um),
      top = Number(canvas.dataset.sectionCollapseTopUm),
      bottom = Number(canvas.dataset.sectionCollapseBottomUm),
      z = 0 >= top || 0 <= bottom ? 0 : (baseCommonLo + bottom) / 2,
      frameTop = Number(canvas.dataset.sectionFrameTop),
      frameBottom = Number(canvas.dataset.sectionFrameBottom),
      upperY = Number(canvas.dataset.sectionCollapseUpperY),
      lowerY = Number(canvas.dataset.sectionCollapseLowerY);

    let y;
    if (z >= top) {
      y = frameTop + ((z1 - z) / Math.max(z1 - top, 1e-12)) * (upperY - frameTop);
    } else if (z <= bottom) {
      y = lowerY + ((bottom - z) / Math.max(bottom - z0, 1e-12)) * (frameBottom - lowerY);
    } else {
      y = (upperY + lowerY) / 2;
    }

    const row = Math.round(y * dpr),
      start = Math.ceil((27 + (width - 37) * 0.1) * dpr),
      end = Math.floor((27 + (width - 37) * 0.9) * dpr),
      pixels = canvas.getContext('2d').getImageData(start, row, end - start, 1).data,
      unique = new Set();
    for (let i = 0; i < pixels.length; i += 4) unique.add([...pixels.slice(i, i + 4)].join(','));
    return [...unique];
  }, baseCommonLo);
  const rgba = colors.map((color) => color.split(',').map(Number)),
    channelRange = [0, 1, 2, 3].map((channel) => {
      const values = rgba.map((value) => value[channel]);
      return Math.max(...values) - Math.min(...values);
    });
  assert.ok(
    channelRange.every((range) => range <= 1),
    `false Section seams: ${colors.join(' / ')}`,
  );
}

export async function sectionMaterialThickness(page, hexColor, xFraction = 0.5) {
  return page.evaluate(
    ({ hexColor, xFraction }) => {
      const canvas = document.querySelector('#sectionCanvas'),
        dpr = Math.min(devicePixelRatio || 1, 2),
        cssWidth = canvas.width / dpr,
        x = Math.round((27 + (cssWidth - 37) * xFraction) * dpr),
        data = canvas.getContext('2d').getImageData(x, 0, 1, canvas.height).data,
        target = [
          parseInt(hexColor.slice(1, 3), 16),
          parseInt(hexColor.slice(3, 5), 16),
          parseInt(hexColor.slice(5, 7), 16),
        ],
        matches = [];
      for (let y = 0; y < canvas.height; y++) {
        const offset = y * 4,
          distance =
            Math.abs(data[offset] - target[0]) +
            Math.abs(data[offset + 1] - target[1]) +
            Math.abs(data[offset + 2] - target[2]);
        if (distance <= 12) matches.push(y);
      }
      let best = 0,
        run = 0,
        previous = -2;
      for (const y of matches) {
        run = y === previous + 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = y;
      }
      const zPxPerUm = Number(canvas.dataset.zPxPerUm);
      return best / dpr / zPxPerUm;
    },
    { hexColor, xFraction },
  );
}
