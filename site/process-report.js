import { buildReportZip } from './report-zip.js';

const PAGE_SIZE = 50;
const VIEWS = new Set(['main', 'mask', 'section', 'three']);

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function markdownEscape(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', ' ');
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function safeName(value) {
  return (
    String(value || 'WaferCAD')
      .replace(/[<>:"|?*\\/\u0000-\u001f]/g, '-')
      .replace(/[. ]+$/g, '')
      .slice(0, 90) || 'WaferCAD'
  );
}

function summarizeLayer(layer) {
  const keys = ['id', 'name', 'color', 'material', 'processFace', 'thickness', 'thicknessUm'];
  return Object.fromEntries(
    keys.filter((key) => layer[key] != null).map((key) => [key, layer[key]]),
  );
}

export function buildProcessReportData({
  project,
  history = [],
  branches = [],
  bookmarks = [],
  position = null,
  date = new Date().toISOString(),
}) {
  if (!project?.model || !Array.isArray(history)) {
    throw new Error('A valid project and History list are required.');
  }
  const model = project.model;
  const steps = history.map((step, index) => ({
    number: index + 1,
    id: step.id,
    branchId: step.branchId,
    parentId: step.parentId || null,
    createdAt: step.createdAt || null,
    processRevision: step.processRevision,
    label: step.displayLabel || step.operation?.label || step.operation?.kind || 'Process step',
    area: step.areaLabel || '',
    restorable: step.restorable === true,
    replayable: step.replayable === true,
    // Keep actual Process descriptors, including exact units and Mask context.
    // Never infer recipe reproducibility from a display label.
    operation: structuredClone(step.operation || {}),
    entityRefs: structuredClone(step.entityRefs || {}),
  }));
  return {
    format: 'wafercad-process-report',
    schema: 1,
    generatedAt: date,
    project: {
      name: String(project.name || 'Untitled'),
      shape: model.shape,
      widthUm: model.width,
      heightUm: model.height,
      thicknessUm: model.thickness,
      processRevision: model.processRevision,
      activeFace: project.activeFace,
      layerCount: (model.layers || []).length,
      layers: (model.layers || []).map(summarizeLayer),
      implants: (model.implants || []).map(summarizeLayer),
      electricalRegions: (model.electricalRegions || []).map(summarizeLayer),
      mask: {
        source: project.maskSourceMode || 'file',
        cell: project.activeCell || null,
        selectedLayers: Array.isArray(project.selectedLayerKeys)
          ? [...project.selectedLayerKeys]
          : [],
        drawShapeCount: project.drawMask?.shapes?.length || 0,
        hasMaskRoi: Boolean(project.maskRoi),
      },
      visualization: {
        sectionScaleMode: project.display?.sectionScaleMode || 'auto',
        threeFastMode: project.display?.threeFastMode !== false,
        activeFace: project.activeFace,
      },
    },
    branches: structuredClone(branches),
    bookmarks: structuredClone(bookmarks),
    position: position ? structuredClone(position) : null,
    recipe: project.processRecipe ? structuredClone(project.processRecipe) : null,
    steps,
  };
}

const CSS = `*{box-sizing:border-box}body{font:15px/1.7 system-ui,-apple-system,Segoe UI,sans-serif;color:#263447;background:#f5f7fa;margin:0}
main{max-width:1060px;margin:auto;padding:38px 24px 90px}header{border-bottom:1px solid #d8dfe8;padding-bottom:24px;margin-bottom:32px}
h1{font-size:clamp(26px,4vw,42px);line-height:1.16;letter-spacing:-.03em;margin:8px 0}h2{font-size:21px;margin-top:38px}
h3{font-size:17px}a{color:#175fb5}a:hover{text-decoration-thickness:2px}p{max-width:82ch}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#617286}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px}
.card,details,figure{background:#fff;border:1px solid #dce2e9;border-radius:10px;padding:14px 18px}
.card b{display:block;font-size:22px}.muted{color:#66778a}.pages{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:9px}
.pages a{padding:10px 14px;background:#fff;border:1px solid #dce2e9;border-radius:8px}
.finder{background:#fff;border:1px solid #dce2e9;border-radius:10px;padding:16px;margin:16px 0 20px}
.finder-fields{display:flex;flex-wrap:wrap;gap:12px}.finder-fields label{display:grid;gap:4px;flex:1;min-width:180px}
.finder input,.finder select{font:inherit;padding:8px 10px;border:1px solid #bbc9d9;border-radius:6px;background:inherit;color:inherit}
.finder ol{list-style:none;padding:0;margin:12px 0 0;max-height:330px;overflow:auto}
.finder li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #e1e5ea}
.finder li[hidden]{display:none}.finder li span{font-size:12px}

table{width:100%;border-collapse:collapse;background:#fff}th,td{text-align:left;border-bottom:1px solid #e1e5ea;padding:9px 12px;vertical-align:top}
th{font-size:12px;text-transform:uppercase;color:#66778a}td{overflow-wrap:anywhere}details{margin:10px 0}
summary{cursor:pointer;font-weight:650}summary span{font-weight:400;color:#66778a;margin-left:8px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;background:#f4f6f9;padding:14px;border-radius:6px;font-size:12px}
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
figure{margin:0;padding:12px}figure img{width:100%;height:auto}figcaption{color:#66778a;font-size:13px}
nav{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:26px 0}
@media(prefers-color-scheme:dark){body{background:#131c28;color:#e3e8f1}.card,details,figure,table,.pages a,.finder{background:#1b2939;border-color:#39495c}header,th,td{border-color:#39495c}.muted,summary span,figcaption{color:#a3b2c5}a{color:#94c0ff}pre{background:#121e2b}}`;

function documentShell(title, body, root = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(title)} · WaferCAD</title><link rel="stylesheet" href="${root}styles/report.css"></head>
<body><main>${body}</main></body></html>\n`;
}

function stepPage(steps, number, pages, title) {
  const path = (index) => `steps-${String(index * PAGE_SIZE + 1).padStart(4, '0')}.html`;
  const rows = steps
    .map(
      (step) => `<details id="step-${step.number}"><summary>#${step.number} ${htmlEscape(
        step.label,
      )}<span>${htmlEscape(step.branchId)} · ${htmlEscape(step.area)}</span></summary>
<p class="muted">Revision ${htmlEscape(step.processRevision)} · ${step.replayable ? 'Replay descriptor available' : 'Replay not guaranteed'} · ${step.restorable ? 'Restorable' : 'No saved state'}</p>
<pre>${htmlEscape(json({ operation: step.operation, entityRefs: step.entityRefs }))}</pre></details>`,
    )
    .join('\n');
  return documentShell(
    title,
    `<nav><a href="../index.html">← Overview</a><span>${number + 1} / ${pages}</span></nav>
<header><div class="eyebrow">Process History</div><h1>${htmlEscape(title)}</h1>
<p>Recorded operations and saved descriptors. Images are never fabricated for historical states.</p></header>
${rows}<nav>${number ? `<a href="${path(number - 1)}">← Previous 50 steps</a>` : '<span></span>'}
${number + 1 < pages ? `<a href="${path(number + 1)}">Next 50 steps →</a>` : '<a href="../index.html">Overview →</a>'}</nav>`,
    '../',
  );
}

function reportHtml(data, pageNames, images, notes) {
  const p = data.project;
  const stepLink = new Map(
    data.steps.map((step) => [
      step.id,
      `history/${pageNames[Math.floor((step.number - 1) / PAGE_SIZE)].html}#step-${step.number}`,
    ]),
  );
  const linkedNode = (nodeId) =>
    stepLink.has(nodeId)
      ? `<a href="${stepLink.get(nodeId)}">${htmlEscape(nodeId)}</a>`
      : htmlEscape(nodeId || 'Not available');
  const searchRows = data.steps
    .map(
      (step) =>
        `<li data-variant="${htmlEscape(step.branchId)}"><a href="${stepLink.get(step.id)}">#${step.number} · ${htmlEscape(step.label)}</a><span class="muted">${htmlEscape(step.branchId)} · r${htmlEscape(step.processRevision)}</span></li>`,
    )
    .join('');
  const variantOptions = data.branches
    .map((variant) => `<option value="${htmlEscape(variant.id)}">${htmlEscape(variant.name)}</option>`)
    .join('');
  const bookmarks = data.bookmarks
    .map(
      (bookmark) =>
        `<li>${htmlEscape(bookmark.name || 'Bookmark')} — ${linkedNode(bookmark.historyNodeId)}</li>`,
    )
    .join('');

  const card = (label, value) =>
    `<div class="card"><span class="muted">${htmlEscape(label)}</span><b>${htmlEscape(
      value,
    )}</b></div>`;
  const layers = p.layers
    .map(
      (layer) =>
        `<tr><td>${htmlEscape(layer.name || 'Unnamed')}</td><td>${htmlEscape(
          layer.id,
        )}</td><td>${htmlEscape(layer.processFace || '—')}</td></tr>`,
    )
    .join('');
  const branches = data.branches
    .map(
      (branch) =>
        `<tr><td>${htmlEscape(branch.name)}</td><td>${htmlEscape(
          branch.processStepCount ?? '—',
        )}</td><td>${linkedNode(branch.headNodeId)}</td></tr>`,
    )
    .join('');
  const gallery = images
    .map(
      (view) =>
        `<figure><a href="assets/current-${view}.png"><img loading="lazy" src="assets/current-${view}.png" alt="${htmlEscape(view)} view"></a><figcaption>${htmlEscape(view)} · captured visible canvas, current inspection state</figcaption></figure>`,
    )
    .join('');
  return documentShell(
    p.name,
    `<header><div class="eyebrow">WaferCAD / Process Report</div><h1>${htmlEscape(
      p.name,
    )}</h1><p class="muted">Generated ${htmlEscape(data.generatedAt)} · Documentation export · Not a restorable project</p></header>
<section class="cards">${card('Process steps', data.steps.length)}${card('Variants', data.branches.length)}${card('Bookmarks', data.bookmarks.length)}${card('Layers', p.layerCount)}</section>
<h2>Project</h2><p>${htmlEscape(p.shape)} base · ${htmlEscape(p.widthUm)} × ${htmlEscape(p.heightUm)} × ${htmlEscape(p.thicknessUm)} µm · Active face ${htmlEscape(p.activeFace)}.</p>
<p>Mask: ${htmlEscape(p.mask.source)} · Cell: ${htmlEscape(
      p.mask.cell || 'none',
    )} · Draw shapes: ${p.mask.drawShapeCount}. Dimensions are canonical µm; rendered appearance is not physical geometry.</p>
<h2>Current inspection captures</h2>${gallery ? `<div class="gallery">${gallery}</div>` : '<p>No visible canvas could be captured.</p>'}
<p class="muted">Only rendered, visible canvases are captured in P1. For a final-state figure, return to the Variant HEAD before exporting. Hidden views and historical steps have no synthesized images.</p>
<h2>Process History</h2><p>Every recorded step is indexed below, with exact operation descriptors in separate JSON files. Pages contain at most ${PAGE_SIZE} steps for fast offline browsing.</p>
<section class="finder" aria-label="Find process steps">
<div class="finder-fields"><label>Search steps<input id="stepSearch" type="search" placeholder="Step number, material or operation" autocomplete="off"></label>
<label>Variant<select id="stepVariant"><option value="">All variants</option>${variantOptions}</select></label></div>
<p class="muted" id="stepMatches">${data.steps.length} steps</p>
<ol id="stepSearchResults">${searchRows}</ol></section>
<div class="pages">${pageNames.map((p, index) => `<a href="history/${p.html}">Steps ${index * PAGE_SIZE + 1}–${Math.min(data.steps.length, (index + 1) * PAGE_SIZE)} →</a>`).join('')}</div>
<h2>Variants</h2><table><thead><tr><th>Variant</th><th>Own steps</th><th>HEAD node</th></tr></thead><tbody>${branches}</tbody></table>
<h2>Bookmarks</h2>${bookmarks ? `<ul>${bookmarks}</ul>` : '<p>No bookmarks.</p>'}
<h2>Materials and layers</h2><table><thead><tr><th>Layer</th><th>Stable ID</th><th>Face</th></tr></thead><tbody>${layers}</tbody></table>
<h2>Data and limitations</h2><p>The report includes a complete Process operation ledger, Variant and Bookmark metadata, and the saved Recipe where available. It excludes historical physical-state geometry and cannot replace a .wafercad backup.</p>
<p>Image coverage: ${images.length} current-view captures. ${htmlEscape(notes.join(' '))}</p>
<p><a href="report.md">Markdown source</a> · <a href="manifest.json">Manifest</a> · <a href="recipe.json">Recipe data</a></p>
<script>
(() => {
  const search = document.getElementById('stepSearch');
  const variant = document.getElementById('stepVariant');
  const rows = Array.from(document.querySelectorAll('#stepSearchResults li'));
  const matches = document.getElementById('stepMatches');
  const searchable = rows.map((row) => row.textContent.toLocaleLowerCase());
  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    rows.forEach((row, index) => {
      const show = (!query || searchable[index].includes(query)) &&
        (!variant.value || row.dataset.variant === variant.value);
      row.hidden = !show;
      if (show) count++;
    });
    matches.textContent = `${count} of ${rows.length} steps`;
  }
  search.addEventListener('input', filter);
  variant.addEventListener('change', filter);
})();
</script>`,
  );
}

function reportMarkdown(data, pageNames, images) {
  const p = data.project;
  const lines = [
    `# ${markdownEscape(p.name)} — WaferCAD Process Report`,
    '',
    `Generated: ${data.generatedAt}`,
    '',
    'Documentation export; not a restorable .wafercad project.',
    '',
    '## Project',
    '',
    `- Base: ${p.shape}, ${p.widthUm} × ${p.heightUm} × ${p.thicknessUm} µm`,
    `- Layers: ${p.layerCount}; Variants: ${data.branches.length}; Steps: ${data.steps.length}`,
    `- Mask: ${markdownEscape(p.mask.source)} / ${markdownEscape(p.mask.cell || 'none')}`,
    '',
    '## Current inspection captures',
    '',
  ];
  for (const view of images) lines.push(`![${view}](assets/current-${view}.png)`);
  lines.push(
    '',
    'Images represent visible canvases at export time, not every historical state.',
    '',
    '## History',
    '',
    '| # | Variant | Process operation | Area | Replayable |',
    '| ---: | --- | --- | --- | --- |',
  );
  for (const step of data.steps) {
    const page = Math.floor((step.number - 1) / PAGE_SIZE);
    lines.push(
      `| ${step.number} | ${markdownEscape(step.branchId)} | [${markdownEscape(step.label)}](history/${pageNames[page].html}#step-${step.number}) | ${markdownEscape(step.area)} | ${step.replayable ? 'Yes' : 'No'} |`,
    );
  }
  lines.push(
    '',
    '## Data files',
    '',
    'The complete structured operation descriptors are in history/*.json.',
    'Variant, Bookmark and Recipe data are available in manifest.json and recipe.json.',
    '',
  );
  return lines.join('\n');
}

export function buildProcessReportArchive(data, { captures = [], warnings = [] } = {}) {
  const accepted = [];
  const files = [{ path: 'styles/report.css', content: CSS }];
  for (const capture of captures) {
    if (!VIEWS.has(capture?.view) || accepted.includes(capture.view)) continue;
    if (!(capture.bytes instanceof Uint8Array) || !capture.bytes.length) continue;
    files.push({ path: `assets/current-${capture.view}.png`, content: capture.bytes });
    accepted.push(capture.view);
  }
  const pages = [];
  for (let index = 0; index < data.steps.length; index += PAGE_SIZE) {
    const slice = data.steps.slice(index, index + PAGE_SIZE);
    const suffix = String(index + 1).padStart(4, '0');
    pages.push({
      html: `steps-${suffix}.html`,
      json: `steps-${suffix}.json`,
      steps: slice,
    });
  }
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const label = `Steps ${page.steps[0].number}–${page.steps.at(-1).number}`;
    files.push({
      path: `history/${page.html}`,
      content: stepPage(page.steps, index, pages.length, label),
    });
    files.push({ path: `history/${page.json}`, content: json(page.steps) });
  }
  const manifest = {
    format: data.format,
    schema: data.schema,
    generatedAt: data.generatedAt,
    project: data.project,
    branches: data.branches,
    bookmarks: data.bookmarks,
    position: data.position,
    historyStepCount: data.steps.length,
    historyFiles: pages.map(({ html, json: filename }) => ({ html, json: filename })),
    captures: accepted,
    warnings,
  };
  files.push(
    { path: 'index.html', content: reportHtml(data, pages, accepted, warnings) },
    { path: 'report.md', content: reportMarkdown(data, pages, accepted) },
    { path: 'manifest.json', content: json(manifest) },
    { path: 'recipe.json', content: json(data.recipe) },
  );
  const blob = buildReportZip(files);
  return {
    blob,
    filename: `${safeName(data.project.name)}-report.zip`,
    stepCount: data.steps.length,
    imageCount: accepted.length,
    fileCount: files.length,
  };
}
