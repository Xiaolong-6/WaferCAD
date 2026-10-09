// Generated static review artifacts. Reads the real examples, never imports core modules.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { format } from 'prettier';
import { createHash } from 'node:crypto';
const target = 'site/ui-v2/prototypes';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const sourceNames = ['m3d-selfpowered-full-replay', 'photodetector-literature-examples'];
const sources = await Promise.all(
  sourceNames.map(async (name) => {
    const bytes = await readFile(`site/examples/${name}.wafercad`);
    return {
      project: JSON.parse(bytes),
      name,
      hash: createHash('sha256').update(bytes).digest('hex'),
    };
  }),
);
function geom(p, ref) {
  const g = p.sharedGeometries[ref];
  if (!p.sharedPolygonTemplates) return g;
  return g.map(([id, x, y]) => {
    const t = p.sharedPolygonTemplates[id];
    if (t.raw) return t.raw;
    return t.rings.map((d) => {
      let px = x,
        py = y;
      const r = [];
      for (let i = 0; i < d.length; i += 2) {
        px += d[i];
        py += d[i + 1];
        r.push([Number((px / 10000).toFixed(4)), Number((py / 10000).toFixed(4))]);
      }
      return [...r, [...r[0]]];
    });
  });
}
function plan(p) {
  const m = p.model;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m.width * 0.55} ${-m.height * 0.55} ${m.width * 1.1} ${m.height * 1.1}" role="img" aria-label="Real source polygons"><g transform="scale(1,-1)">${m.regions
    .map((r) => {
      const color = m.layers.find((l) => l.id === r.stack.at(-1).layerId).color;
      const d = (r.geom || geom(p, r.geomRef))
        .map((poly) => poly.map((ring) => `M${ring.map((pt) => pt.join(',')).join('L')}Z`).join(''))
        .join('');
      return `<path fill="${escape(color)}" fill-rule="evenodd" d="${escape(d)}"/>`;
    })
    .join('')}</g></svg>`;
}
const label = (text, input) => `<label>${escape(text)}${input}</label>`;
const field = (name, value, type = 'text') =>
  label(name, `<input type="${type}" value="${escape(value)}"/>`);
const actions = (...names) =>
  `<div class="actions">${names.map((n, i) => `<button type="button"${i === 0 ? ' class="primary"' : ''}>${escape(n)}</button>`).join('')}</div>`;
function panel(p, screen, layout) {
  const mode = `<div class="mode-strip"><a target="_top" href="${layout}-process.html">Manual</a><a target="_top" href="${layout}-recipe.html">Recipe</a></div>`;
  if (screen === 'process')
    return `${mode}<div class="form">${label('Operation', '<select><option>Deposit</option><option>Etch</option><option>Implant</option><option>Record</option></select>')}${label('Material / target', `<select>${p.model.layers.map((l) => `<option>${escape(l.name)}</option>`).join('')}</select>`)}${field('Thickness / depth · µm', '0.07', 'number')}${label('Active face', '<select><option>Front</option><option>Rear</option></select>')}${label('Area', '<select><option>Selected Draw mask</option><option>Full wafer</option></select>')}${actions('Apply · simulated')}<p class="aux">27 actual layers · 551 actual regions. These controls are presentation drafts, not Process execution.</p></div>`;
  if (screen === 'recipe') {
    const steps = p.processRecipe.steps;
    const s = steps[2];
    return `${mode}<section><h3>${escape(p.processRecipe.name)}</h3>${actions('Run All', 'Continue', 'Rebuild Base')}<div class="failure">Step 3 · ${escape(s.id)} · simulated failure. Fix this step, then Continue / Rebuild. Source unchanged.</div><div class="form"><h3>Edit step 3 · ${escape(s.id)}</h3>${field('Material / target', s.params.material || s.params.target)}${field('Thickness · µm', s.params.thicknessUm, 'number')}${actions('Save draft')}</div></section><section><h3>Steps · ${steps.length}</h3><div class="list">${steps.map((step, i) => `<div class="row ${i === 2 ? 'failed-row selected' : ''}"><strong>${i + 1} · ${escape(step.command.toUpperCase())}</strong><div class="aux">${escape(step.params.material || step.params.target || step.params.label || step.params.name || step.command)}</div></div>`).join('')}</div></section>`;
  }
  return `<section><h3>Variants · ${p.snapshotBranches.branches.length}</h3><div class="list">${p.snapshotBranches.branches.map((b) => `<div class="row ${b.id === p.snapshotBranches.activeBranchId ? 'selected' : ''}"><strong>${b.parentBranchId ? '↳ ' : ''}${escape(b.name)}</strong><div class="aux">${escape(b.id)}${b.parentBranchId ? ` · parent ${escape(b.parentBranchId)}` : ''}</div></div>`).join('')}</div></section><section><h3>History · ${p.snapshotBranches.nodes.length} nodes</h3>${actions('Restore', 'Edit old step', 'Create Variant')}<div class="list">${p.snapshotBranches.nodes.map((n) => `<div class="row"><strong>${escape(n.operation.label)}</strong><div class="aux">${escape(n.id)} · ${escape(n.branchId)}</div></div>`).join('')}</div></section>`;
}
function page(layout, screen) {
  const source = sources[screen === 'history' ? 1 : 0],
    p = source.project;
  const title = `${layout.toUpperCase()} · ${screen[0].toUpperCase() + screen.slice(1)}`;
  const thumbnail =
    screen === 'history'
      ? 'photodetector-literature-three.webp'
      : 'm3d-selfpowered-heterogeneous-ic-three.webp';
  const view = (name, content, readout) =>
    `<section class="view"><div class="view-head">${name}</div><div class="science">${content}</div><div class="readout">${readout}</div></section>`;
  const main = plan(p);
  const model = p.model;
  const nav = ['process', 'recipe', 'history']
    .map(
      (s) =>
        `<a target="_top" href="${layout}-${s}.html" class="${s === 'recipe' ? 'recipe-nav ' : ''}${s === screen ? 'current' : ''}">${s[0].toUpperCase() + s.slice(1)}</a>`,
    )
    .join('');
  const child = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="./layout.css"></head><body data-empty="false" data-failed="${screen === 'recipe'}" data-placement="top"><div class="wb" data-layout="${layout}"><header class="top"><strong>WaferCAD</strong><span class="name" title="${escape(p.name)}">${escape(p.name)}</span><button class="back" type="button" onclick="document.body.dataset.view=document.body.dataset.view==='true'?'false':'true';this.textContent=document.body.dataset.view==='true'?'Back to editor':'Back to results'">Back to results</button><span class="tag">ROUND 1 · NO CORE</span></header><div class="body"><nav class="nav">${nav}</nav><div class="empty-note">Empty list only · actual ${model.regions.length}-region model retained. No vacant inspector space.</div><aside class="inspector"><header class="panel-head"><h3><span class="breadcrumb">Process / </span>${escape(screen[0].toUpperCase() + screen.slice(1))}</h3><span class="aux">${layout === 'c' ? 'Bottom flow' : 'Docked'}</span></header><div class="panel-scroll">${panel(p, screen, layout)}</div></aside><div class="gap"></div><main class="stage">${view('Main', main, `${model.width} × ${model.height} µm · ${model.layers.length} layers · ${model.regions.length} regions`)}${view('3D', `<img src="../../examples/thumbnails/${thumbnail}" alt="Recorded real final model">`, 'Real final thumbnail · no live 3D renderer')}${view(
    'Layer content',
    `<div style="padding:12px">${model.layers
      .slice(-6)
      .map((l) => `<p class="aux">${escape(l.name)}</p>`)
      .join('')}</div>`,
    'Scientific content is read-only',
  )}${view('Source scale', `<div style="padding:12px"><h3>${model.layers.length} layers</h3><p>${p.processRecipe.steps.length} Recipe steps</p><p>${p.snapshotBranches.nodes.length} History nodes</p><p>${p.snapshotBranches.branches.length} source Variants</p></div>`, 'View tools / Split / Maximize / Section are deferred')}</main></div><footer class="foot">Static layout review · ${source.name}.wafercad · no storage writes · no scientific execution.</footer></div></body></html>`;
  return `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · M1.5 round 1</title><link rel="icon" href="data:,"><link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="./layout.css"></head><body data-ready="false" data-errors="0"><header class="debug"><a href="./index.html">所有方案</a><strong>${title}</strong><label>宽度<select id="width"><option>1440</option><option>1024</option><option>768</option><option>390</option></select></label><label><input type="checkbox" id="empty">空列表 / 有数据</label><label><input type="checkbox" id="failure" ${screen === 'recipe' ? 'checked' : ''}>Recipe 失败步骤</label><label>Recipe<select id="placement"><option value="top">一级工作区</option><option value="process">Process 内模式</option></select></label><span class="aux">真实模型不清空；按预设改变内部实际视口。</span></header><div class="frame-scroll"><iframe id="frame" title="${escape(title)} prototype" srcdoc="${escape(child)}"></iframe></div><script>window.addEventListener('error',()=>{document.body.dataset.errors=String(Number(document.body.dataset.errors)+1)});const frame=document.getElementById('frame');function update(){frame.style.width=document.getElementById('width').value+'px';const body=frame.contentDocument&&frame.contentDocument.body;if(!body)return;body.dataset.empty=String(document.getElementById('empty').checked);body.dataset.failed=String(document.getElementById('failure').checked);body.dataset.placement=document.getElementById('placement').value;document.body.dataset.ready='true'}frame.addEventListener('load',update);['width','empty','failure','placement'].forEach(id=>document.getElementById(id).addEventListener('change',update));</script></body></html>\n`;
}
const descriptions = {
  a: '左导航 + 左停靠面板。参数顺手、画布高度完整；代价是横向宽度。适合 1440px，1024px 仍停靠。',
  b: '顶部导航 + 右上下文面板。省去左栏，Variants 集中；代价是顶部高度与左右视线移动。适合 1024–1440px。',
  c: '左工作流导航 + 底部面板。横向画布大，长列表可并排；代价是画布高度与短屏滚动。适合较高的 1024/1440px 屏幕。',
};
const index = `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M1.5 第一轮 · 静态原型入口</title><link rel="icon" href="data:,"><link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="./layout.css"></head><body class="index"><h1>M1.5 第一轮：请选择布局和 Recipe 位置</h1><p>九个静态页面，可直接双击打开。每页调试条可切换 1440/1024/768/390、空/有列表、Recipe 失败步骤和两种 Recipe 位置。不使用 Playwright，不出截图，不接核心数据。</p><div class="cards">${['a', 'b', 'c'].map((l) => `<section class="card"><h2>${l.toUpperCase()} 方案</h2><p>${descriptions[l]}</p>${['process', 'recipe', 'history'].map((s) => `<a href="${l}-${s}.html">${s === 'process' ? 'Process · M3D 27 层' : s === 'recipe' ? 'Recipe · M3D 35 步 · 第 3 步失败' : 'History · Photodetector 7 个真实 Variants / 空列表'}</a>`).join('')}<p class="aux">768/390px 使用普通上下文档流；预览在上、编辑在下，返回结果始终可达。</p></section>`).join('')}</div><h2>逐项回答 PR #161 的三个失败</h2><table><thead><tr><th>失败</th><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>① 空 History 浪费桌面</td><td>移除左 inspector 和分隔列，画布回收宽度；紧凑提示代替空栏。</td><td>移除右 inspector，画布回收宽度；只留紧凑提示。</td><td>移除空底部面板，画布回收高度；只留提示行。</td></tr><tr><td>② 1024px 遮挡画布</td><td>270px 面板参与 Grid，不转 overlay。</td><td>270px 右面板参与 Grid，不浮到画布上。</td><td>底部面板占独立 Grid 行，牺牲高度而不是遮挡。</td></tr><tr><td>③ 390px flyout 满屏</td><td colspan="3">768/390px 均采用单画布预览 + 下方编辑区，没有 flyout / overlay / 假 Dock 按钮；顶部保持“返回结果”。</td></tr></tbody></table><h2>Recipe 两种位置</h2><p><strong>一级工作区：</strong>长 Recipe 与失败定位直接可达，代价是多一个主导航入口。<strong>Process 内模式：</strong>Manual / Recipe 统一，代价是多一次模式切换；失败提示和编辑仍留在该模式。两种放法均可在每页调试条切换，未代选。</p><h2>真实内容与边界</h2><p>M3D：27 层、551 区域、35 Recipe 步骤、36 History 节点；Photodetector：46 节点、7 个真实 Variants。空切换只隐藏列表/编辑，不清空模型。Main 使用源多边形，3D 是已有真实最终缩略图。</p><p>第二轮 Project / Mask、视图工具栏、Split / Maximize、Section Z-break、图标体系、字体对比与组件补全暂停；等你选定后再做。</p><p class="aux">M3D SHA-256 ${sources[0].hash}<br>Photodetector SHA-256 ${sources[1].hash}</p></body></html>\n`;
const currentIndex = index
  .replaceAll('（待你选）', '（已选 Inter）')
  .replace('M1.5 第一轮：请选择布局和 Recipe 位置', 'M1.5：已选 A 方案，Recipe 在 Process 内')
  .replace(
    '<div class="cards">',
    '<section class="card"><h2>第二轮 · A 完整工作区</h2><p>已按你的选择固定 A / Process 内 Recipe。下面保留第一轮比较作为存档。</p><a href="a-full/index.html">打开完整原型 · Project / Mask / Process / History / 四视图</a><a href="a-full/fonts.html">字体对比 · 系统栈 vs 本地 Inter WOFF2（待你选）</a><p class="aux">1440 / 1024 / 768 / 390 实际视口；示例、空 History、失败步骤、字体可切换。Split / Maximize、Z-break、busy / progress、分隔条、溢出菜单均为 UI 演示。</p></section><div class="cards">',
  )
  .replace(
    '两种放法均可在每页调试条切换，未代选。',
    '第一轮存档仍可切换两种放法；当前已由用户选定 Process 内模式。',
  )
  .replace(
    '第二轮 Project / Mask、视图工具栏、Split / Maximize、Section Z-break、图标体系、字体对比与组件补全暂停；等你选定后再做。',
    '第二轮已补齐，字体待用户选择。停在 M1.5，不进入 M2；没有核心执行与产品存储接线。',
  );
await mkdir(target, { recursive: true });
const outputs = [
  [
    'index.html',
    currentIndex
      .replaceAll('（待你选）', '（已选 Inter）')
      .replace('字体待用户选择。', '已选 Inter Variable WOFF2 / system fallback。'),
  ],
  ...['a', 'b', 'c'].flatMap((l) =>
    ['process', 'recipe', 'history'].map((s) => [`${l}-${s}.html`, page(l, s)]),
  ),
];
for (const [file, html] of outputs) {
  const path = `${target}/${file}`;
  const formatted = await format(html, {
    ...JSON.parse(await readFile('.prettierrc.json', 'utf8')),
    parser: 'html',
  });
  if (process.argv.includes('--write')) await writeFile(path, formatted);
  else if ((await readFile(path, 'utf8')) !== formatted) throw new Error(`Stale ${path}`);
}
console.log(
  `Static prototypes: ${outputs.length} HTML files; no fetch, modules, core or Playwright.`,
);
