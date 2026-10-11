// Decision mock only. Production adapters and approved M2 references are untouched.
import { createInspectionFields } from '../view-kit/inspection-fields.js';
import { createSectionDetailRoiController } from '../../controllers/section-detail-roi-controller.js';

const { el, button } = window.WaferCadV2Components;
window.WaferCadV2Icons.installSprite();
const { input, choice, pair } = createInspectionFields({
  hook: (id, node) => {
    node.id = id;
    return node;
  },
});
const card = (title, proposed, ...content) =>
  el(
    'article',
    { class: `review-card${proposed ? ' proposed' : ''}` },
    el(
      'span',
      { class: 'review-label' },
      proposed ? '用户已选择 · 待生产接入' : '当前 M2 · 控件复现',
    ),
    el('h3', {}, title),
    ...content,
  );
const decision = (id, title, left, right, note) =>
  el(
    'section',
    { class: 'decision', id },
    el('h2', {}, title),
    el('div', { class: 'comparison' }, left, right),
    el('p', { class: 'decision-note' }, note),
  );
const mockButton = (label, action, glyph = 'export') => button(label, action, glyph);
const exportMenu = (name, ...options) => {
  const menu = el('div', { class: 'review-export-menu', hidden: true }, ...options);
  const entry = mockButton('Export', `menu:${name}`);
  entry.setAttribute('aria-expanded', 'false');
  entry.onclick = () => {
    menu.hidden = !menu.hidden;
    entry.setAttribute('aria-expanded', String(!menu.hidden));
  };
  return el('div', { class: 'review-export' }, entry, menu);
};
const currentDetail = el(
  'div',
  { class: 'p-form' },
  choice('ROI shape', 'mockShape', [
    ['rect', 'Rectangle'],
    ['circle', 'Circle'],
    ['ring', 'Ring'],
    ['ring-sector', 'Ring sector'],
  ]),
  choice('Reference', 'mockAnchor', [
    ['center', 'Center / origin'],
    ['top-left', 'Top-left'],
    ['bottom-left', 'Bottom-left'],
    ['top-right', 'Top-right'],
    ['bottom-right', 'Bottom-right'],
  ]),
  pair(input('X · µm', 'mockX', 0), input('Y · µm', 'mockY', 0)),
  pair(input('Width · µm', 'mockWidth', 10), input('Height · µm', 'mockHeight', 10)),
  input('Radius · µm', 'mockRadius', 5),
  input('Rotation · °', 'mockRotation', 0),
  el(
    'div',
    { class: 'p-actions' },
    mockButton('Clear Detail ROI', 'mock-clear', 'clear'),
    mockButton('Apply settings', 'mock-apply', 'check'),
  ),
  el('p', { class: 'p-aux' }, '这些字段属于 M2 通用 ROI mock；尚未接入真实 Section Detail。'),
);
const detailButton = mockButton('Draw / redraw', 'detail-draw', 'roi');
detailButton.id = 'sectionDetailRoiBtn';
const shapeButton = mockButton('□', 'detail-shape', null);
shapeButton.id = 'sectionDetailShapeBtn';
shapeButton.setAttribute('aria-label', 'Toggle Detail Rectangle / Circle');
const closeButton = mockButton('×', 'detail-clear', null);
closeButton.id = 'sectionDetailCloseBtn';
closeButton.setAttribute('aria-label', 'Clear Detail ROI');
const canvas = el('canvas', { id: 'sectionCanvas', 'aria-label': 'Detail ROI interaction sketch' });
const overlay = el(
  'div',
  { id: 'sectionDetailRoiOverlay', hidden: true },
  ...['nw', 'ne', 'sw', 'se'].map((corner) =>
    el('button', { 'data-detail-handle': corner, 'aria-label': `Resize ${corner}` }),
  ),
);
const inset = el(
  'div',
  { id: 'sectionDetailInset', hidden: true },
  el(
    'div',
    { id: 'sectionDetailInsetHead' },
    el('span', { id: 'sectionDetailZoom' }),
    shapeButton,
    closeButton,
  ),
  el('canvas', { id: 'sectionDetailInsetCanvas' }),
);
const sketch = el('div', { id: 'sectionBody', class: 'mock-section' }, canvas, overlay, inset);
const detailStatus = el(
  'p',
  { class: 'p-aux', 'aria-live': 'polite' },
  '点击 Draw / redraw，再在示意图上拖拽。',
);
const detailReadout = el('output', { class: 'p-aux', id: 'detail-readout' });
const proposedDetail = card(
  'Detail ROI · Section 独立细节',
  true,
  el(
    'div',
    { class: 'p-actions' },
    detailButton,
    mockButton('Clear Detail ROI', 'detail-clear-outside', 'clear'),
  ),
  el(
    'p',
    {},
    '矩形 / 圆形；直接拖动选区、调整四角、拖动 inset。选区坐标相对 Section 画布，独立于 Main ROI。',
  ),
  sketch,
  detailReadout,
  detailStatus,
  el(
    'p',
    { class: 'p-aux' },
    '上图仅是控件示意，不表示 M3D 物理结构。此处复用真实 legacy Detail ROI 控制器。',
  ),
);
const sectionStatus = el('p', { class: 'p-aux', 'aria-live': 'polite' }, '点击对比导出入口。');
const task = el(
  'div',
  { class: 'mock-task', hidden: true },
  el('strong', {}, 'Exporting GLB… · 任务 mock'),
  el('p', { class: 'p-aux' }, '42% · Generating physical mesh'),
  el('progress', { value: 42, max: 100 }),
  mockButton('Abort', 'task-abort', 'close'),
);
const threeStatus = el(
  'p',
  { class: 'p-aux', 'aria-live': 'polite' },
  '点击 GLB 查看任务取消位置；不会导出实际文件。',
);
document
  .getElementById('review-root')
  .append(
    decision(
      'detail',
      '01 · Section Detail ROI',
      card('Detail ROI settings', false, currentDetail),
      proposedDetail,
      '已选择：采用右侧真实 Detail 方案，保留矩形 / 圆形与 inset，移除 µm、Reference、Rotation、Ring / Ring sector 字段。',
    ),
    decision(
      'section-export',
      '02 · Section 导出',
      card(
        '当前 Export 菜单',
        false,
        el(
          'div',
          { class: 'p-form' },
          mockButton('Export Section SVG', 'current-svg'),
          mockButton('Export Section PNG', 'current-png'),
        ),
        el('p', {}, 'M2 同时展示 SVG / PNG。当前 Section 的 legacy 导出绑定只有 SVG。'),
      ),
      card(
        '拟接入 Export 菜单',
        true,
        exportMenu(
          'section',
          mockButton('SVG', 'proposed-svg'),
          button('PNG · 待实现', null, 'export', { disabled: true }),
        ),
        sectionStatus,
        el('p', {}, 'SVG 使用现有真实 exporter。PNG 待另行授权实现。'),
      ),
      '已选择：一个 Export 主入口，下拉菜单提供 SVG 与禁用的 PNG · 待实现。此页不生成文件。',
    ),
    decision(
      'three-export',
      '03 · 3D 导出与取消',
      card(
        '当前 3D Export 菜单',
        false,
        el(
          'div',
          { class: 'p-form' },
          mockButton('Export PNG', 'current-three-png'),
          mockButton('Export GLB · physical units', 'current-three-glb'),
          mockButton('Cancel export', 'current-cancel', 'close'),
        ),
        el('p', {}, 'M2 的 Cancel export 只清空 mock exportTask；不能证明真实 GLB 已停止。'),
      ),
      card(
        '拟接入 3D Export 菜单',
        true,
        exportMenu(
          'three',
          mockButton('PNG', 'proposed-three-png'),
          mockButton('GLB · physical units', 'proposed-three-glb'),
        ),
        task,
        threeStatus,
        el(
          'p',
          {},
          'GLB 仍走现有任务管理器与 AbortSignal。取消放在运行任务面板；PNG 是现有 3× capture。',
        ),
      ),
      '已选择：一个 Export 主入口，下拉菜单提供 PNG / GLB；取消仅放在运行任务面板中的 Abort。',
    ),
  );
let detailRoi = null;
const detail = createSectionDetailRoiController({
  getRoi: () => detailRoi,
  setRoi: (value) => {
    detailRoi = value;
  },
  onChanged: () => {
    detailReadout.textContent = detailRoi
      ? `归一化位置 / 尺寸：X ${(detailRoi.x * 100).toFixed(1)}% · Y ${(detailRoi.y * 100).toFixed(1)}% · 宽 ${(detailRoi.width * 100).toFixed(1)}% · 高 ${(detailRoi.height * 100).toFixed(1)}%`
      : 'Detail ROI：无';
  },
  status: (value) => {
    detailStatus.textContent = value;
  },
});
const drawSketch = () => {
  canvas.width = Math.max(1, Math.round(canvas.clientWidth));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f8fb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ['#82b6a6', '#6c8ebf', '#d6a85f', '#8a7cb8'].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(20, 50 + i * 28, canvas.width - 40, 24);
  });
  detail.sync();
};
drawSketch();
detail.bind();
new ResizeObserver(drawSketch).observe(canvas);
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'detail-clear-outside') detail.clear();
  if (['current-svg', 'current-png', 'proposed-svg'].includes(action))
    sectionStatus.textContent =
      action === 'current-png'
        ? '当前 M2 PNG 入口；真实 Section PNG 尚无已接入路径。'
        : '拟接入现有真实 SVG exporter；本页仅演示菜单。';
  if (action === 'proposed-three-glb') {
    task.hidden = false;
    threeStatus.textContent =
      '运行任务面板中的 Abort 将连接真实任务取消。这里是冻结在 42% 的 mock。';
  }
  if (action === 'task-abort') {
    task.hidden = true;
    threeStatus.textContent = '取消位置预览完成；本页没有运行后台导出。';
  }
  if (action === 'current-cancel')
    threeStatus.textContent = 'M2 只清空 mock exportTask；真实取消需要连接同一个任务管理器。';
  if (action === 'proposed-three-png')
    threeStatus.textContent = '拟使用现有 capturePng(3)；本页不启动 renderer。';
});
document.body.dataset.ready = 'true';
