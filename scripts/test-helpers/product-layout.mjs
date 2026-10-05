import assert from 'node:assert/strict';
import { checkLayout, closeFunctionPanel, openFunctionPanel } from './product.mjs';
import { processBenchmark, projectForBenchmark } from '../process-benchmarks.mjs';
import { loadProject } from './product-scientific.mjs';

const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );

export function createProductLayoutChecks({ capture }) {
  async function checkStickerGrouping(page, name) {
    if (name === 'phone') return;
    const geometry = await page.evaluate(() => {
      const panel = document.getElementById('mainPanel'),
        section = document.getElementById('sectionPanel'),
        workspace = document.querySelector('.workspace'),
        panelStyle = getComputedStyle(panel),
        sectionStyle = getComputedStyle(section),
        workspaceStyle = getComputedStyle(workspace);
      return {
        gap: parseFloat(workspaceStyle.gap),
        radius: parseFloat(panelStyle.borderTopLeftRadius),
        border: parseFloat(panelStyle.borderTopWidth),
        shadow: panelStyle.boxShadow,
        sectionRadius: parseFloat(sectionStyle.borderTopLeftRadius),
      };
    });
    assert.ok(geometry.gap >= 4, `${name}: workspace sticker gap is missing`);
    assert.ok(geometry.radius >= 6, `${name}: primary view sticker radius is missing`);
    assert.equal(geometry.border, 1, `${name}: primary view sticker border is missing`);
    assert.notEqual(geometry.shadow, 'none', `${name}: primary view sticker shadow is missing`);
    assert.ok(geometry.sectionRadius >= 6, `${name}: Section sticker radius is missing`);

    await openFunctionPanel(page, 'process', { timeout: 10000 });
    const processSticker = await page.locator('#operationTools').evaluate((section) => {
      const style = getComputedStyle(section);
      return {
        radius: parseFloat(style.borderTopLeftRadius),
        border: parseFloat(style.borderTopWidth),
        shadow: style.boxShadow,
        active: section.classList.contains('workstation-section-active'),
      };
    });
    assert.ok(processSticker.radius >= 6, `${name}: Process sticker radius is missing`);
    assert.equal(processSticker.border, 1, `${name}: Process sticker border is missing`);
    assert.notEqual(processSticker.shadow, 'none', `${name}: Process sticker shadow is missing`);
    assert.equal(
      processSticker.active,
      true,
      `${name}: active function sticker is not highlighted`,
    );
    await closeFunctionPanel(page);
  }

  async function checkWorkstationShellLayout(page, name) {
    const compact = await page.evaluate(() =>
      document.documentElement.classList.contains('workstation-compact-ui'),
    );

    if (name === 'phone') {
      assert.equal(compact, true, 'phone: compact workstation class is missing');
      assert.equal(await page.locator('#mainPanel').isVisible(), true);
      assert.equal(await page.locator('#maskPanel').isHidden(), true);
      assert.equal(await page.locator('#threePanel').isHidden(), true);
      assert.equal(await page.locator('#layerLegend').isHidden(), true);
      assert.equal(await page.locator('.workstation-section-layers').isVisible(), true);
      assert.equal(await page.locator('#mainPanBtn').isVisible(), true);
      assert.equal(await page.locator('#mainZoomOut').isVisible(), true);
      assert.equal(await page.locator('#mainZoomIn').isVisible(), true);
      assert.equal(await page.locator('#mainZoomFit').isVisible(), true);
      assert.equal(await page.locator('#sectionPanel .export-control > summary').isVisible(), true);
      assert.equal(await page.locator('.workstation-section-collapse').isVisible(), true);
      return;
    }

    assert.equal(compact, false, `${name}: desktop viewport should not be compact`);

    const viewbarOrder = await page.locator('.workstation-view-tabs > button').allTextContents();
    assert.deepEqual(
      viewbarOrder.map((text) => text.trim()),
      ['Overview', 'Main', 'Mask', '3D', 'Split'],
      `${name}: viewbar layout buttons are not in the requested order`,
    );

    const splitButton = page.getByRole('button', { name: 'Split' });
    await splitButton.click();
    assert.equal(await splitButton.getAttribute('aria-pressed'), 'true');
    await page.evaluate(
      () =>
        new Promise((resolveFrame) =>
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
        ),
    );
    const split = await page.evaluate(() => {
      const main = document.getElementById('mainPanel').getBoundingClientRect();
      const three = document.getElementById('threePanel').getBoundingClientRect();
      const stage = document.querySelector('.workstation-view-stage').getBoundingClientRect();
      return {
        main: { left: main.left, right: main.right, width: main.width },
        three: { left: three.left, right: three.right, width: three.width },
        stage: { left: stage.left, right: stage.right, width: stage.width },
      };
    });
    const ratio = split.main.width / split.three.width;
    assert.ok(ratio > 0.92 && ratio < 1.08, `${name}: Split is not balanced (${ratio})`);
    const stickerGap = split.three.left - split.main.right;
    assert.ok(
      stickerGap >= 4 && stickerGap <= 9,
      `${name}: Split sticker gap is inconsistent (${stickerGap}px)`,
    );
    assert.ok(
      Math.abs(split.main.left - split.stage.left) <= 2 &&
        Math.abs(split.three.right - split.stage.right) <= 2,
      `${name}: Split does not fill the primary stage`,
    );

    // Each visible Split pane title is a selector. Replace the left Main pane
    // with Mask, then restore the default Main + 3D pair.
    const leftMainSelector = page.locator(
      '#mainPanel .workstation-split-view-selector[data-split-slot="left"]',
    );
    await leftMainSelector.locator('summary').click();
    await leftMainSelector.locator('[data-view="mask"]').click();
    assert.equal(await page.locator('#mainPanel').isHidden(), true);
    assert.equal(await page.locator('#maskPanel').isVisible(), true);
    assert.equal(await page.locator('#threePanel').isVisible(), true);
    const maskThreeOrder = await page.evaluate(() => ({
      mask: document.getElementById('maskPanel').getBoundingClientRect().left,
      three: document.getElementById('threePanel').getBoundingClientRect().left,
      left: document.querySelector('.workstation-view-stage')?.dataset.splitLeft,
      right: document.querySelector('.workstation-view-stage')?.dataset.splitRight,
    }));
    assert.equal(maskThreeOrder.left, 'mask');
    assert.equal(maskThreeOrder.right, 'three');
    assert.ok(
      maskThreeOrder.mask < maskThreeOrder.three,
      `${name}: Split left/right order was lost`,
    );

    const leftMaskSelector = page.locator(
      '#maskPanel .workstation-split-view-selector[data-split-slot="left"]',
    );
    await leftMaskSelector.locator('summary').click();
    await leftMaskSelector.locator('[data-view="main"]').click();
    assert.equal(await page.locator('#mainPanel').isVisible(), true);
    assert.equal(await page.locator('#maskPanel').isHidden(), true);
    assert.equal(await page.locator('#threePanel').isVisible(), true);

    const overviewButton = page.getByRole('button', { name: 'Overview' });
    await overviewButton.click();
    assert.equal(await overviewButton.getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => {
      const canvas = document.getElementById('mainCanvas');
      if (!canvas?.checkVisibility()) return false;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      return (
        Math.abs(canvas.width - rect.width * dpr) <= 2 &&
        Math.abs(canvas.height - rect.height * dpr) <= 2
      );
    });
    await page.evaluate(
      () =>
        new Promise((resolveFrame) =>
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
        ),
    );
  }

  async function checkCompactProcessLayout(page, name) {
    await openFunctionPanel(page, 'process');
    await page.locator('[data-process-mode="etch"]').click();
    await page.locator('#etchSurfaceMode').selectOption('rough');

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('#operationTools'),
        feature = document.querySelector('#roughFeatureRow').getBoundingClientRect(),
        featureCv = document.querySelector('#roughFeatureCvRow').getBoundingClientRect(),
        height = document.querySelector('#roughHeightRow').getBoundingClientRect(),
        heightCv = document.querySelector('#roughHeightCvRow').getBoundingClientRect(),
        labels = [...panel.querySelectorAll('.param-field > span:first-child')].map((element) => {
          const rect = element.getBoundingClientRect();
          return { text: element.textContent.trim(), height: rect.height, width: rect.width };
        });
      return {
        overflow: panel.scrollWidth - panel.clientWidth,
        featureTop: feature.top,
        featureCvTop: featureCv.top,
        heightTop: height.top,
        heightCvTop: heightCv.top,
        labels,
      };
    });

    assert.ok(
      metrics.overflow <= 1,
      `${name}: Process panel horizontal overflow ${metrics.overflow}px`,
    );
    if (name === 'phone') {
      assert.ok(
        Math.abs(metrics.featureTop - metrics.featureCvTop) > 4,
        'phone: Feature fields should collapse to one column',
      );
      assert.ok(
        Math.abs(metrics.heightTop - metrics.heightCvTop) > 4,
        'phone: Height fields should collapse to one column',
      );
    } else {
      assert.ok(
        Math.abs(metrics.featureTop - metrics.featureCvTop) <= 2,
        `${name}: Feature XY and CV are not aligned in one row`,
      );
      assert.ok(
        Math.abs(metrics.heightTop - metrics.heightCvTop) <= 2,
        `${name}: Height mean and CV are not aligned in one row`,
      );
      for (const label of metrics.labels) {
        assert.ok(label.height <= 16, `${name}: wrapped parameter label ${label.text}`);
      }
    }

    await capture(page, `${name}-tab-operation-rough`);

    await page.locator('[data-process-mode="implant"]').click();
    const implantOverflow = await page
      .locator('#operationTools')
      .evaluate((panel) => panel.scrollWidth - panel.clientWidth);
    assert.ok(
      implantOverflow <= 1,
      `${name}: Implant panel horizontal overflow ${implantOverflow}px`,
    );
    await capture(page, `${name}-tab-operation-implant`);
  }

  async function checkPopover(page, selector, panelId) {
    const popup = await page.locator(selector).boundingBox();
    const panel = await page.locator(panelId).boundingBox();
    assert.ok(popup && panel);
    assert.ok(
      popup.x >= panel.x && popup.x + popup.width <= panel.x + panel.width,
      `${selector}: horizontally clipped`,
    );
    assert.ok(
      popup.y >= panel.y && popup.y + popup.height <= panel.y + panel.height,
      `${selector}: vertically clipped`,
    );
  }

  async function coords(page) {
    return Promise.all(
      ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy'].map(async (id) =>
        Number(await page.locator(`#${id}`).inputValue()),
      ),
    );
  }

  async function checkSectionCollapse(page, name) {
    const entry = page.locator('#sectionCollapseAxisBtn'),
      editor = page.locator('#sectionCollapseEditor'),
      canvas = page.locator('#sectionCanvas');

    await canvas.scrollIntoViewIfNeeded();
    if (name === 'phone') {
      const dockToggle = page.locator('.workstation-section-collapse');
      assert.equal(await page.locator('#sectionPanel .export-control > summary').isVisible(), true);
      assert.equal((await dockToggle.textContent()).trim(), 'Hide');
      await dockToggle.click();
      assert.equal((await dockToggle.textContent()).trim(), 'Show');
      assert.equal(await page.locator('#sectionBody').isHidden(), true);
      await dockToggle.click();
      assert.equal((await dockToggle.textContent()).trim(), 'Hide');
      await canvas.waitFor({ state: 'visible' });
    }
    assert.equal(await entry.isVisible(), true, `${name}: Z collapse axis entry is missing`);
    assert.equal(
      await editor.isHidden(),
      true,
      `${name}: collapse editor should be hidden normally`,
    );

    const before = {
      top: Number(await canvas.getAttribute('data-section-collapse-top-um')),
      bottom: Number(await canvas.getAttribute('data-section-collapse-bottom-um')),
      breakY: Number(await canvas.getAttribute('data-section-collapse-break-y')),
    };
    assert.ok(Number.isFinite(before.top) && Number.isFinite(before.bottom));
    assert.ok(before.top > before.bottom);
    assert.ok(Number.isFinite(before.breakY));

    await entry.click();
    await editor.waitFor({ state: 'visible', timeout: 1000 });
    assert.equal(await editor.isVisible(), true, `${name}: collapse editor did not open`);
    await checkPopover(page, '#sectionCollapseEditor', '#sectionPanel');
    await capture(page, `${name}-section-z-collapse-edit`);
    await page.waitForFunction(() => {
      const canvas = document.getElementById('sectionCanvas'),
        breakY = Number(canvas?.dataset.sectionCollapseBreakY),
        height = canvas?.getBoundingClientRect().height || 0;
      return Number.isFinite(breakY) && breakY > 0 && breakY < height;
    });
    const handleSize = await page.locator('#sectionCollapseTopHandle').boundingBox();
    assert.ok(handleSize);
    assert.ok(
      handleSize.width >= (name === 'phone' ? 24 : 16),
      `${name}: collapse ruler handle is too small`,
    );

    await page.locator('#sectionCollapseTarget').selectOption('top');
    await page.locator('#sectionCollapseStep').selectOption('0.1');
    await page.locator('#sectionCollapsePlus').click();
    const nudgedTop = Number(await canvas.getAttribute('data-section-collapse-top-um'));
    assert.ok(nudgedTop > before.top, `${name}: fine adjustment did not update the top boundary`);

    await page.keyboard.press('Escape');
    assert.equal(await editor.isHidden(), true, `${name}: Escape did not close collapse editor`);
    const closedTop = Number(await canvas.getAttribute('data-section-collapse-top-um'));
    close(closedTop, nudgedTop, 1e-9);

    await entry.click();
    await editor.waitFor({ state: 'visible', timeout: 1000 });
    assert.equal(await editor.isVisible(), true);
    close(
      Number(
        await page
          .locator('#sectionCollapseTopValue')
          .textContent()
          .then((text) => Number(text.replace('−', '-').replace(/[^0-9+.-]/g, ''))),
      ),
      nudgedTop,
      1e-3,
    );
    await page.locator('#sectionCollapseClose').click();
    assert.equal(await editor.isHidden(), true);

    const afterBreakY = Number(await canvas.getAttribute('data-section-collapse-break-y'));
    close(afterBreakY, before.breakY, 1e-9);

    await entry.dblclick();
    assert.equal(await canvas.getAttribute('data-section-collapse-enabled'), 'false');
    assert.equal(await entry.getAttribute('aria-pressed'), 'false');
    assert.equal(await editor.isHidden(), true);
    assert.equal(await page.locator('#threeHost').getAttribute('data-z-collapse-enabled'), 'false');
    await capture(page, `${name}-section-z-full`);

    // Single click stays inert while collapse is off; double-click restores the
    // saved break bounds without losing the user's previous adjustment.
    await entry.click();
    assert.equal(await editor.isHidden(), true);
    await entry.dblclick();
    assert.equal(await canvas.getAttribute('data-section-collapse-enabled'), 'true');
    assert.equal(await entry.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#threeHost').getAttribute('data-z-collapse-enabled'), 'true');
    close(Number(await canvas.getAttribute('data-section-collapse-top-um')), nudgedTop, 1e-9);

    await capture(page, `${name}-section-z-collapse`);
  }

  async function dragHandle(page, endpoint, dx, dy, cancel = false) {
    const handle = page.locator(`[data-endpoint=${endpoint}]`);
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    assert.ok(box);
    // Grab off-center to prove the endpoint does not jump to the pointer.
    await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 4 + dx, box.y + box.height / 2 + 2 + dy, {
      steps: 5,
    });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }

  async function checkAB(page, name) {
    const nmRoundedMicron = (value) => Math.round(value * 1000) / 1000;
    const mainCanvas = page.locator('#mainCanvas');
    const canvas = await mainCanvas.boundingBox();
    assert.ok(canvas);

    // Existing Slice geometry is editable even with the parameter panel closed.
    assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
    assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);

    // Slice opens the parameter panel and starts one-shot replacement creation.
    await page.locator('#sectionControlsBtn').click();
    assert.equal(await page.locator('#sectionCoordsPanel').isVisible(), true);
    assert.equal(await page.locator('[data-endpoint=a]').isHidden(), true);
    await page.evaluate(
      () =>
        new Promise((resolveFrame) =>
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
        ),
    );
    const creationCanvas = await mainCanvas.boundingBox();
    assert.ok(creationCanvas);
    if (name === 'phone') {
      assert.ok(
        Math.abs(creationCanvas.width - canvas.width) <= 2 &&
          Math.abs(creationCanvas.height - canvas.height) <= 2,
        'phone: opening Slice controls must not resize Main canvas',
      );
    }
    await page.mouse.move(
      creationCanvas.x + creationCanvas.width * 0.28,
      creationCanvas.y + creationCanvas.height * 0.42,
    );
    await page.mouse.down();
    await page.mouse.move(
      creationCanvas.x + creationCanvas.width * 0.72,
      creationCanvas.y + creationCanvas.height * 0.58,
      { steps: 5 },
    );
    await page.mouse.up();
    assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
    assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);

    const before = await coords(page);
    const scale = Number(await mainCanvas.getAttribute('data-x-px-per-um'));
    assert.ok(Number.isFinite(scale) && scale > 0, `${name}: Main render scale is unavailable`);
    await dragHandle(page, 'a', 16, -8);
    const after = await coords(page);
    close(after[0], nmRoundedMicron(before[0] + 16 / scale));
    close(after[1], nmRoundedMicron(before[1] + 8 / scale));
    close(after[2], before[2]);
    close(after[3], before[3]);
    assert.equal(await page.locator('#sectionCoordsPanel').isVisible(), true);
    await dragHandle(page, 'b', -10, 9);
    const moved = await coords(page);
    close(moved[2], nmRoundedMicron(before[2] - 10 / scale));
    close(moved[3], nmRoundedMicron(before[3] - 9 / scale));
    await dragHandle(page, 'a', 12, 6, true);
    assert.deepEqual(await coords(page), moved, 'Escape cancels only the in-progress drag');
    if (name === 'phone') {
      const session = await page.context().newCDPSession(page);
      const target = await page.locator('[data-endpoint=a]').boundingBox();
      const x = target.x + target.width / 2;
      const y = target.y + target.height / 2;
      const beforeTouch = await coords(page);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, id: 0 }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + 6, y: y - 4, id: 0 }],
      });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const touchMoved = await coords(page);
      close(touchMoved[0], nmRoundedMicron(beforeTouch[0] + 6 / scale));
      close(touchMoved[1], nmRoundedMicron(beforeTouch[1] + 4 / scale));
      moved[0] = touchMoved[0];
      moved[1] = touchMoved[1];
      await session.detach();
    }
    await openFunctionPanel(page, 'process');
    await page.locator('#faceToggleBtn').click();
    await closeFunctionPanel(page);
    await dragHandle(page, 'a', 8, 0);
    const back = await coords(page);
    close(back[0], nmRoundedMicron(moved[0] - 8 / scale));
    await openFunctionPanel(page, 'process');
    await page.locator('#faceToggleBtn').click();
    await closeFunctionPanel(page);
    const handleSize = (await page.locator('[data-endpoint=a]').boundingBox()).width;
    assert.ok(
      handleSize <= (name === 'phone' ? 32 : 24),
      `A/B handle is too large: ${handleSize}px`,
    );
    await page.locator('#mainZoomIn').click();
    assert.equal((await page.locator('[data-endpoint=a]').boundingBox()).width, handleSize);
    await dragHandle(page, 'a', 4, 0);
    back[0] = nmRoundedMicron(back[0] + 4 / (scale * 1.25));
    close((await coords(page))[0], back[0]);
    await page.locator('#mainZoomFit').click();

    if (name === 'phone') {
      const panButton = page.locator('#mainPanBtn');
      const handleBeforePan = await page.locator('[data-endpoint=a]').boundingBox();
      const panCanvas = await mainCanvas.boundingBox();
      assert.ok(handleBeforePan && panCanvas);
      await panButton.click();
      assert.equal(await panButton.getAttribute('aria-pressed'), 'true');
      await page.mouse.move(
        panCanvas.x + panCanvas.width * 0.55,
        panCanvas.y + panCanvas.height * 0.55,
      );
      await page.mouse.down();
      await page.mouse.move(
        panCanvas.x + panCanvas.width * 0.55 + 24,
        panCanvas.y + panCanvas.height * 0.55 + 16,
        { steps: 5 },
      );
      await page.mouse.up();
      const handleAfterPan = await page.locator('[data-endpoint=a]').boundingBox();
      assert.ok(handleAfterPan);
      close(handleAfterPan.x - handleBeforePan.x, 24, 2);
      close(handleAfterPan.y - handleBeforePan.y, 16, 2);
      await panButton.click();
      assert.equal(await panButton.getAttribute('aria-pressed'), 'false');
      await page.locator('#mainZoomFit').click();
      await page.evaluate(
        () =>
          new Promise((resolveFrame) =>
            requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
          ),
      );
      const handleAfterFit = await page.locator('[data-endpoint=a]').boundingBox();
      assert.ok(handleAfterFit);
      close(handleAfterFit.x, handleBeforePan.x, 2);
      close(handleAfterFit.y, handleBeforePan.y, 2);
    }
    await openFunctionPanel(page, 'project');
    for (const [unit, multiplier] of [
      ['nm', 1000],
      ['mm', 0.001],
      ['um', 1],
    ]) {
      await page.locator('#xyUnitSelect').selectOption(unit);
      const values = await coords(page);
      values.forEach((value, i) => close(value, back[i] * multiplier));
    }
    await closeFunctionPanel(page);
    await page.locator('[data-endpoint=a]').focus();
    await page.keyboard.press('ArrowRight');
    close((await coords(page))[0], nmRoundedMicron(back[0] + 1 / scale));
    await capture(page, `${name}-ab-edit`);
    await checkLayout(page);
    // Closing Slice hides only the parameter panel; geometry remains directly editable.
    await page.locator('#sectionControlsBtn').click();
    assert.equal(await page.locator('#sectionCoordsPanel').isHidden(), true);
    await page.evaluate(
      () =>
        new Promise((resolveFrame) =>
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
        ),
    );
    await page.locator('[data-endpoint=a]').waitFor({ state: 'visible' });
    if (name === 'phone') {
      const closedCanvas = await mainCanvas.boundingBox();
      assert.ok(closedCanvas);
      assert.ok(
        Math.abs(closedCanvas.width - canvas.width) <= 2 &&
          Math.abs(closedCanvas.height - canvas.height) <= 2,
        'phone: closing Slice controls must not resize Main canvas',
      );
    }
  }

  async function checkROI(page, name) {
    const benchmark = await processBenchmark('island', 'conformal');
    const project = projectForBenchmark(benchmark);
    project.display.xyUnit = 'nm';
    // 10 nm features in a 100 nm base, with a high screen zoom.
    project.model = (await import('../../site/model.js')).createModel({
      shape: 'rect',
      width: 0.1,
      height: 0.1,
      thickness: 10,
    });
    project.section = { a: [-0.04, 0], b: [0.04, 0] };
    project.roi = { type: 'rect', a: [-0.007123, -0.004567], b: [0.005222, 0.006789] };
    project.planViews.main.zoom = 4;
    await loadProject(page, project, `${name}-nm-roi`);
    await page.locator('#focusEditor > summary').click();
    await checkPopover(page, '#focusEditor .focus-popover', '#mainPanel');
    const width = Number(await page.locator('#roiWidth').inputValue());
    const height = Number(await page.locator('#roiHeight').inputValue());
    assert.equal(width, 12);
    assert.equal(height, 11);
    const center = [
      Number(await page.locator('#roiX').inputValue()),
      Number(await page.locator('#roiY').inputValue()),
    ];
    assert.deepEqual(center, [-1, 1]);
    for (const reference of ['top-left', 'bottom-left', 'top-right', 'bottom-right', 'center']) {
      await page.locator('#roiAnchorSelect').selectOption(reference);
      close(Number(await page.locator('#roiWidth').inputValue()), width);
      close(Number(await page.locator('#roiHeight').inputValue()), height);
    }
    close(Number(await page.locator('#roiX').inputValue()), center[0]);
    close(Number(await page.locator('#roiY').inputValue()), center[1]);
    await page.locator('#focusEditor > summary').click();
    await page.locator('#mainCanvas').scrollIntoViewIfNeeded();
    const box = await page.locator('#mainCanvas').boundingBox();
    const scale = Math.min((box.width - 68) / 0.1, (box.height - 68) / 0.1) * 4;
    const x = box.x + box.width / 2 - 0.007123 * scale;
    const y = box.y + box.height / 2 - 0.006789 * scale;
    await page.mouse.move(x + 2, y + 2);
    await page.mouse.down();
    await page.mouse.move(x - 9 + 2, y - 7 + 2, { steps: 5 });
    await page.mouse.up();
    await page.locator('#focusEditor > summary').click();
    assert.equal(
      Number(await page.locator('#roiWidth').inputValue()),
      Math.round(12.345 + (9 / scale) * 1000),
    );
    assert.equal(
      Number(await page.locator('#roiHeight').inputValue()),
      Math.round(11.356 + (7 / scale) * 1000),
    );
    await page.locator('#focusEditor .focus-popover').evaluate((element) => {
      element.scrollTop = 0;
    });
    await checkPopover(page, '#focusEditor .focus-popover', '#mainPanel');
    await capture(page, `${name}-nm-roi-editor`);
    await page.locator('#focusEditor > summary').click();

    project.roi = { type: 'circle', c: [0, 0], r: 0.005 };
    await loadProject(page, project, `${name}-circle`);
    await page.locator('#mainCanvas').scrollIntoViewIfNeeded();
    const circleBox = await page.locator('#mainCanvas').boundingBox();
    const circleScale = Math.min((circleBox.width - 68) / 0.1, (circleBox.height - 68) / 0.1) * 4;
    const hx = circleBox.x + circleBox.width / 2 - 0.005 * circleScale;
    const hy = circleBox.y + circleBox.height / 2 - 0.005 * circleScale;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx - 10, hy - 10, { steps: 5 });
    await page.mouse.up();
    await page.locator('#focusEditor > summary').click();
    assert.equal(
      Number(await page.locator('#roiRadius').inputValue()),
      Math.round(5 + (5 / circleScale) * 1000),
    );
    await page.locator('#focusEditor > summary').click();

    project.roi = { type: 'sector', c: [0, 0], r: 0.01, startDeg: 300, endDeg: 60 };
    await loadProject(page, project, `${name}-sector`);
    await page.locator('#focusEditor > summary').click();
    assert.equal((await page.locator('#roiShapeLabel').textContent()).trim(), 'Sector');
    assert.equal(await page.locator('#roiRadius').inputValue(), '10');
    assert.equal(await page.locator('#roiStartAngle').inputValue(), '300');
    assert.equal(await page.locator('#roiEndAngle').inputValue(), '60');
    await page.locator('#focusEditor > summary').click();
    await checkLayout(page);
  }

  return {
    checkStickerGrouping,
    checkWorkstationShellLayout,
    checkCompactProcessLayout,
    checkPopover,
    checkSectionCollapse,
    checkAB,
    checkROI,
  };
}
