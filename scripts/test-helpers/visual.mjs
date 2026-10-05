import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export async function assertVisualBaseline(
  page,
  name,
  {
    baselineDir = 'tests/visual-baselines',
    artifactDir = 'test-results/visual-diff',
    update = false,
    maxDiffRatio = 0.0005,
    channelThreshold = 16,
    locator = null,
    screenshotOptions = {},
  } = {},
) {
  const target = locator ? page.locator(locator) : page;
  const actual = await target.screenshot({
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    ...screenshotOptions,
  });

  const baselinePath = resolve(baselineDir, `${name}.png`);
  if (update) {
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, actual);
    return {
      name,
      updated: true,
      baselinePath,
      diffPixels: 0,
      diffRatio: 0,
    };
  }

  let expected;
  try {
    expected = await readFile(baselinePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      assert.fail(
        `Missing visual baseline: ${baselinePath}. Generate and review it with npm run update:ui:visual.`,
      );
    }
    throw error;
  }

  const comparison = await page.evaluate(
    async ({ actualBase64, expectedBase64, channelThreshold, maxDiffRatio }) => {
      const decode = async (base64) => {
        const response = await fetch(`data:image/png;base64,${base64}`);
        return createImageBitmap(await response.blob());
      };

      const [actualImage, expectedImage] = await Promise.all([
        decode(actualBase64),
        decode(expectedBase64),
      ]);

      if (
        actualImage.width !== expectedImage.width ||
        actualImage.height !== expectedImage.height
      ) {
        return {
          sameSize: false,
          actualWidth: actualImage.width,
          actualHeight: actualImage.height,
          expectedWidth: expectedImage.width,
          expectedHeight: expectedImage.height,
          diffPixels: null,
          diffRatio: 1,
          diffPngBase64: null,
        };
      }

      const width = actualImage.width;
      const height = actualImage.height;
      const actualCanvas = document.createElement('canvas');
      const expectedCanvas = document.createElement('canvas');
      const diffCanvas = document.createElement('canvas');
      for (const canvas of [actualCanvas, expectedCanvas, diffCanvas]) {
        canvas.width = width;
        canvas.height = height;
      }

      const actualContext = actualCanvas.getContext('2d', { willReadFrequently: true });
      const expectedContext = expectedCanvas.getContext('2d', { willReadFrequently: true });
      const diffContext = diffCanvas.getContext('2d');
      actualContext.drawImage(actualImage, 0, 0);
      expectedContext.drawImage(expectedImage, 0, 0);

      const actualPixels = actualContext.getImageData(0, 0, width, height).data;
      const expectedPixels = expectedContext.getImageData(0, 0, width, height).data;
      const diff = diffContext.createImageData(width, height);
      let diffPixels = 0;

      for (let offset = 0; offset < actualPixels.length; offset += 4) {
        const delta = Math.max(
          Math.abs(actualPixels[offset] - expectedPixels[offset]),
          Math.abs(actualPixels[offset + 1] - expectedPixels[offset + 1]),
          Math.abs(actualPixels[offset + 2] - expectedPixels[offset + 2]),
          Math.abs(actualPixels[offset + 3] - expectedPixels[offset + 3]),
        );
        if (delta > channelThreshold) {
          diffPixels += 1;
          diff.data[offset] = 255;
          diff.data[offset + 1] = 0;
          diff.data[offset + 2] = 0;
          diff.data[offset + 3] = 255;
        } else {
          const gray = Math.round(
            (expectedPixels[offset] + expectedPixels[offset + 1] + expectedPixels[offset + 2]) / 3,
          );
          diff.data[offset] = gray;
          diff.data[offset + 1] = gray;
          diff.data[offset + 2] = gray;
          diff.data[offset + 3] = 70;
        }
      }

      const diffRatio = diffPixels / Math.max(1, width * height);
      let diffPngBase64 = null;
      if (diffRatio > maxDiffRatio) {
        diffContext.putImageData(diff, 0, 0);
        diffPngBase64 = diffCanvas.toDataURL('image/png').split(',')[1];
      }
      return {
        sameSize: true,
        actualWidth: width,
        actualHeight: height,
        expectedWidth: width,
        expectedHeight: height,
        diffPixels,
        diffRatio,
        diffPngBase64,
      };
    },
    {
      actualBase64: actual.toString('base64'),
      expectedBase64: expected.toString('base64'),
      channelThreshold,
      maxDiffRatio,
    },
  );

  const failed = !comparison.sameSize || comparison.diffRatio > maxDiffRatio;

  if (failed) {
    await mkdir(artifactDir, { recursive: true });
    await writeFile(resolve(artifactDir, `${name}.actual.png`), actual);
    await writeFile(resolve(artifactDir, `${name}.expected.png`), expected);
    if (comparison.diffPngBase64) {
      await writeFile(
        resolve(artifactDir, `${name}.diff.png`),
        Buffer.from(comparison.diffPngBase64, 'base64'),
      );
    }
  }

  assert.equal(
    comparison.sameSize,
    true,
    `${name}: screenshot size changed from ${comparison.expectedWidth}×${comparison.expectedHeight} to ${comparison.actualWidth}×${comparison.actualHeight}`,
  );
  assert.ok(
    comparison.diffRatio <= maxDiffRatio,
    `${name}: visual diff ratio ${comparison.diffRatio.toFixed(6)} exceeds ${maxDiffRatio}; artifacts written to ${artifactDir}`,
  );

  return {
    name,
    updated: false,
    baselinePath,
    diffPixels: comparison.diffPixels,
    diffRatio: comparison.diffRatio,
  };
}
